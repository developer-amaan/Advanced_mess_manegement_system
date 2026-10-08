import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { initializeDatabase, readDatabase, writeDatabase } from './db.js';
import { requireAuth, requireRole, secret } from './middleware.js';
import { indiaToday, mealQrWindow, mealSelectionWindow } from './mealSchedule.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 4000;
const localOrigin = /^https?:\/\/(?:(?:localhost)|(?:127(?:\.\d{1,3}){3})|(?:10(?:\.\d{1,3}){3})|(?:192\.168(?:\.\d{1,3}){2})|(?:172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}))(?:\:\d{1,5})?$/i;
const tunnelOrigin = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:trycloudflare\.com|loca\.lt)(?:\:\d{1,5})?$/i;
const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const wildcardOriginPattern = (pattern) => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
};
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (localOrigin.test(origin) || tunnelOrigin.test(origin)) return true;
  if (configuredOrigins.some((pattern) => pattern === origin || pattern.includes('*') && wildcardOriginPattern(pattern).test(origin))) return true;
  return false;
};
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error('This app only accepts browser requests from localhost, private networks, secure preview tunnels, or configured deployment origins.'));
  },
}));
app.use(express.json({ limit: '32kb' }));

const today = () => indiaToday();
const byDateThenTime = (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
const isExpected = (rsvp) => ['yes', 'attended', 'absent'].includes(rsvp.status);
const safeUser = ({ passwordHash, ...user }) => user;
const hashQrToken = (token) => createHash('sha256').update(token).digest('hex');
let qrRedemptionQueue = Promise.resolve();

function serializeQrRedemption(operation) {
  const result = qrRedemptionQueue.then(operation);
  qrRedemptionQueue = result.catch(() => {});
  return result;
}

function getMealForQr(db, token) {
  const tokenHash = hashQrToken(token);
  return db.meals.find((meal) => meal.rsvps.some((rsvp) => rsvp.qrTokenHash && timingSafeEqual(Buffer.from(rsvp.qrTokenHash, 'hex'), Buffer.from(tokenHash, 'hex'))));
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, password, room } = req.body;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) return res.status(400).json({ error: 'Enter a name between 2 and 60 characters.' });
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Password must be between 6 and 100 characters.' });
    const db = await readDatabase();
    if (db.users.some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) return res.status(409).json({ error: 'An account with this email already exists.' });
    const user = { id: randomUUID(), name: name.trim(), email: email.trim().toLowerCase(), passwordHash: await bcrypt.hash(password, 10), role: 'student', room: typeof room === 'string' ? room.trim().slice(0, 20) : '' };
    db.users.push(user);
    for (const meal of db.meals) {
      if (meal.date >= today()) meal.rsvps.push({ studentId: user.id, status: 'no', updatedAt: new Date().toISOString() });
    }
    await writeDatabase(db);
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, secret, { expiresIn: '7d' });
    return res.status(201).json({ token, user: safeUser(user) });
  } catch (error) { return next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Email and password are required.' });
    const db = await readDatabase();
    const user = db.users.find((entry) => entry.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, secret, { expiresIn: '7d' });
    return res.json({ token, user: safeUser(user) });
  } catch (error) { return next(error); }
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const db = await readDatabase();
    const user = db.users.find((entry) => entry.id === req.user.id);
    if (!user) return res.status(401).json({ error: 'Account not found.' });
    return res.json({ user: safeUser(user) });
  } catch (error) { return next(error); }
});

app.get('/api/meals', requireAuth, async (req, res, next) => {
  try {
    const db = await readDatabase();
    const meals = db.meals.filter((meal) => !req.query.date || meal.date === req.query.date).sort(byDateThenTime);
    return res.json({ meals: meals.map((meal) => {
      const { rsvps, ...mealDetails } = meal;
      const window = mealSelectionWindow(meal);
      const qrWindow = mealQrWindow(meal);
      const studentRsvp = rsvps.find((rsvp) => rsvp.studentId === req.user.id);
      return {
        ...mealDetails,
        myStatus: studentRsvp?.status || 'no',
        hasQrPass: Boolean(studentRsvp?.qrTokenHash && studentRsvp.qrExpiresAt && Date.now() < Date.parse(studentRsvp.qrExpiresAt)),
        qrWindowOpensAt: qrWindow.opensAt.toISOString(),
        qrWindowExpiresAt: qrWindow.expiresAt.toISOString(),
        expected: rsvps.filter(isExpected).length,
        selectionOpensAt: window.opensAt.toISOString(),
        selectionClosesAt: window.closesAt.toISOString(),
        selectionOpen: window.isOpen,
      };
    }) });
  } catch (error) { return next(error); }
});

app.put('/api/meals/:id/rsvp', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['yes', 'no'].includes(status)) return res.status(400).json({ error: 'RSVP status must be yes or no.' });
    const db = await readDatabase();
    const meal = db.meals.find((entry) => entry.id === req.params.id);
    if (!meal) return res.status(404).json({ error: 'Meal not found.' });
    if (!mealSelectionWindow(meal).isOpen) return res.status(400).json({ error: `${meal.type} selection is closed. Check the meal’s RSVP deadline.` });
    const rsvp = meal.rsvps.find((entry) => entry.studentId === req.user.id);
    if (!rsvp) return res.status(404).json({ error: 'Student RSVP record not found.' });
    if (rsvp.status === 'attended') return res.status(409).json({ error: 'This meal has already been redeemed and cannot be changed.' });
    rsvp.status = status;
    rsvp.updatedAt = new Date().toISOString();
    let qrToken;
    let expiresAt;
    if (status === 'yes') {
      qrToken = randomBytes(32).toString('base64url');
      expiresAt = mealQrWindow(meal).expiresAt.toISOString();
      rsvp.qrTokenHash = hashQrToken(qrToken);
      rsvp.qrExpiresAt = expiresAt;
    } else {
      rsvp.qrTokenHash = null;
      rsvp.qrExpiresAt = null;
    }
    await writeDatabase(db);
    return res.json({ mealId: meal.id, status, ...(qrToken ? { qrToken, expiresAt, meal: { id: meal.id, type: meal.type, date: meal.date, time: meal.time } } : {}), qrAvailableAt: mealQrWindow(meal).opensAt.toISOString(), expected: meal.rsvps.filter(isExpected).length });
  } catch (error) { return next(error); }
});

app.post('/api/meals/:id/qr', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const db = await readDatabase();
    const meal = db.meals.find((entry) => entry.id === req.params.id);
    if (!meal) return res.status(404).json({ error: 'Meal not found.' });
    const rsvp = meal.rsvps.find((entry) => entry.studentId === req.user.id);
    if (!rsvp || rsvp.status !== 'yes') return res.status(400).json({ error: 'Confirm this meal during its selection window before requesting a QR pass.' });
    if (rsvp.qrRedeemedAt) return res.status(409).json({ error: 'This meal pass was already used. Each student can check in only once per meal.' });
    const { expiresAt } = mealQrWindow(meal);
    const now = new Date();
    if (now > expiresAt) return res.status(410).json({ error: 'This meal’s QR check-in window has ended.' });
    const token = randomBytes(32).toString('base64url');
    rsvp.qrTokenHash = hashQrToken(token);
    rsvp.qrExpiresAt = expiresAt.toISOString();
    rsvp.updatedAt = new Date().toISOString();
    await writeDatabase(db);
    return res.json({ token, expiresAt: expiresAt.toISOString(), meal: { id: meal.id, type: meal.type, date: meal.date, time: meal.time } });
  } catch (error) { return next(error); }
});

app.post('/api/attendance/scan', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { token } = req.body;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return res.status(400).json({ error: 'Scan a valid MessMeter meal QR code.' });
    const result = await serializeQrRedemption(async () => {
      const db = await readDatabase();
      const meal = getMealForQr(db, token);
      if (!meal) return { status: 404, body: { error: 'QR pass is invalid or has already been used.' } };
      const rsvp = meal.rsvps.find((entry) => entry.qrTokenHash && timingSafeEqual(Buffer.from(entry.qrTokenHash, 'hex'), Buffer.from(hashQrToken(token), 'hex')));
      if (!rsvp || rsvp.status !== 'yes') return { status: 409, body: { error: 'This student does not have an active RSVP for the meal.' } };
      if (rsvp.qrRedeemedAt) return { status: 409, body: { error: 'This meal pass was already redeemed.' } };
      if (!rsvp.qrExpiresAt || Date.now() > Date.parse(rsvp.qrExpiresAt)) {
        rsvp.qrTokenHash = null;
        rsvp.qrExpiresAt = null;
        await writeDatabase(db);
        return { status: 410, body: { error: 'This meal QR pass has expired.' } };
      }
      const { opensAt, expiresAt } = mealQrWindow(meal);
      if (Date.now() < opensAt.getTime()) return { status: 400, body: { error: `Meal check-in opens at ${opensAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.` } };
      if (Date.now() > expiresAt.getTime()) return { status: 410, body: { error: 'This meal’s QR check-in window has ended.' } };
      const student = db.users.find((user) => user.id === rsvp.studentId);
      if (!student) return { status: 404, body: { error: 'Student account was not found.' } };
      rsvp.status = 'attended';
      rsvp.updatedAt = new Date().toISOString();
      rsvp.qrRedeemedAt = rsvp.updatedAt;
      rsvp.qrTokenHash = null;
      rsvp.qrExpiresAt = null;
      meal.actualConsumed = (meal.actualConsumed ?? 0) + 1;
      await writeDatabase(db);
      return { status: 200, body: { accepted: true, student: { name: student.name, room: student.room }, meal: { id: meal.id, type: meal.type, date: meal.date, time: meal.time }, actualConsumed: meal.actualConsumed, redeemedAt: rsvp.updatedAt } };
    });
    return res.status(result.status).json(result.body);
  } catch (error) { return next(error); }
});

app.get('/api/dashboard/student', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const db = await readDatabase();
    const mine = db.meals.filter((meal) => meal.rsvps.some((entry) => entry.studentId === req.user.id)).sort(byDateThenTime);
    const forStudent = (meal) => {
      const myStatus = meal.rsvps.find((entry) => entry.studentId === req.user.id)?.status || 'no';
      const studentRsvp = meal.rsvps.find((entry) => entry.studentId === req.user.id);
      const { rsvps, ...publicMeal } = meal;
      const selection = mealSelectionWindow(meal);
      const qr = mealQrWindow(meal);
      return {
        ...publicMeal,
        myStatus,
        expected: rsvps.filter(isExpected).length,
        selectionOpensAt: selection.opensAt.toISOString(),
        selectionClosesAt: selection.closesAt.toISOString(),
        selectionOpen: selection.isOpen,
        qrWindowOpensAt: qr.opensAt.toISOString(),
        qrWindowExpiresAt: qr.expiresAt.toISOString(),
        hasQrPass: Boolean(studentRsvp?.qrTokenHash && studentRsvp.qrExpiresAt && Date.now() < Date.parse(studentRsvp.qrExpiresAt)),
      };
    };
    const todayMeals = mine.filter((meal) => meal.date === today()).map(forStudent);
    const history = mine.filter((meal) => meal.date < today());
    const attended = history.filter((meal) => meal.rsvps.find((entry) => entry.studentId === req.user.id).status === 'attended').length;
    const cancelled = history.filter((meal) => meal.rsvps.find((entry) => entry.studentId === req.user.id).status === 'cancelled').length;
    return res.json({ todayMeals, upcoming: mine.filter((meal) => meal.date >= today()).slice(0, 8).map(forStudent), stats: { attended, cancelled, history: history.length, wasteSavedKg: Number((cancelled * 0.45).toFixed(1)) } });
  } catch (error) { return next(error); }
});

app.get('/api/history', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const db = await readDatabase();
    const meals = db.meals.filter((meal) => meal.date < today()).sort(byDateThenTime).reverse();
    return res.json({ meals: meals.map((meal) => {
      const myStatus = meal.rsvps.find((entry) => entry.studentId === req.user.id)?.status || 'absent';
      const { rsvps, ...publicMeal } = meal;
      return { ...publicMeal, myStatus };
    }) });
  } catch (error) { return next(error); }
});

app.get('/api/dashboard/manager', requireAuth, requireRole('manager'), async (_req, res, next) => {
  try {
    const db = await readDatabase();
    const todayMeals = db.meals.filter((meal) => meal.date === today()).sort(byDateThenTime);
    const expected = todayMeals.reduce((total, meal) => total + meal.rsvps.filter(isExpected).length, 0);
    const recordedMeals = todayMeals.filter((meal) => meal.actualConsumed !== null);
    const consumed = recordedMeals.reduce((total, meal) => total + meal.actualConsumed, 0);
    const unused = recordedMeals.reduce((total, meal) => total + Math.max(0, meal.rsvps.filter(isExpected).length - meal.actualConsumed), 0);
    const pastMeals = db.meals.filter((meal) => meal.date < today());
    const saved = pastMeals.reduce((sum, meal) => sum + meal.rsvps.filter((entry) => entry.status === 'cancelled').length * 0.45, 0);
    return res.json({ todayMeals: todayMeals.map((meal) => {
      const { rsvps, ...mealDetails } = meal;
      return { ...mealDetails, expected: rsvps.filter(isExpected).length };
    }).map((meal) => {
      const source = todayMeals.find((entry) => entry.id === meal.id);
      const checkedIn = source.rsvps.filter((entry) => entry.status === 'attended').length;
      return { ...meal, checkedIn, recommendedPrep: Math.ceil(meal.expected * 1.05) };
    }), stats: { students: db.users.filter((user) => user.role === 'student').length, expected, checkedIn: todayMeals.reduce((total, meal) => total + meal.rsvps.filter((entry) => entry.status === 'attended').length, 0), consumed, unused, wasteSavedKg: Number(saved.toFixed(1)) }, trend: Array.from({ length: 7 }, (_, index) => dateOffset(-6 + index)).map((date) => {
      const meals = db.meals.filter((meal) => meal.date === date);
      return { date, expected: meals.reduce((total, meal) => total + meal.rsvps.filter(isExpected).length, 0), consumed: meals.reduce((total, meal) => total + (meal.actualConsumed ?? 0), 0) };
    }) });
  } catch (error) { return next(error); }
});

app.get('/api/attendance', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const db = await readDatabase();
    const meal = db.meals.find((entry) => entry.id === req.query.mealId);
    if (!meal) return res.status(404).json({ error: 'Choose a valid meal.' });
    const students = db.users.filter((user) => user.role === 'student').map((user) => ({
      id: user.id, name: user.name, email: user.email, room: user.room,
      status: meal.rsvps.find((rsvp) => rsvp.studentId === user.id)?.status || 'no',
    })).sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ students, actualConsumed: meal.actualConsumed });
  } catch (error) { return next(error); }
});

app.put('/api/meals/:id/attendance', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { studentId, status, actualConsumed } = req.body;
    const db = await readDatabase();
    const meal = db.meals.find((entry) => entry.id === req.params.id);
    if (!meal) return res.status(404).json({ error: 'Meal not found.' });
    if (studentId !== undefined) {
      if (!['attended', 'absent', 'yes', 'no', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid attendance status.' });
      const rsvp = meal.rsvps.find((entry) => entry.studentId === studentId);
      if (!rsvp) return res.status(404).json({ error: 'Student RSVP not found.' });
      if (rsvp.qrRedeemedAt && status !== 'attended') return res.status(409).json({ error: 'A redeemed meal check-in cannot be changed.' });
      rsvp.status = status;
      rsvp.updatedAt = new Date().toISOString();
      if (status === 'attended') rsvp.qrRedeemedAt ||= rsvp.updatedAt;
      if (status !== 'yes') {
        rsvp.qrTokenHash = null;
        rsvp.qrExpiresAt = null;
      }
    }
    if (actualConsumed !== undefined) {
      if (!Number.isInteger(actualConsumed) || actualConsumed < 0 || actualConsumed > 10000) return res.status(400).json({ error: 'Consumed plates must be a whole number from 0 to 10,000.' });
      meal.actualConsumed = actualConsumed;
    }
    await writeDatabase(db);
    return res.json({ meal: { id: meal.id, date: meal.date, type: meal.type, actualConsumed: meal.actualConsumed } });
  } catch (error) { return next(error); }
});

app.post('/api/meals', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { date, type, time, items, unavailableItems = [] } = req.body;
    const types = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Choose a valid meal date.' });
    if (!types.includes(type)) return res.status(400).json({ error: 'Choose a valid meal type.' });
    if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: 'Choose a valid meal time.' });
    if (!Array.isArray(items) || items.length > 20 || items.some((item) => typeof item !== 'string' || item.trim().length < 1 || item.trim().length > 60)) return res.status(400).json({ error: 'Add between 0 and 20 menu items, each no longer than 60 characters.' });
    if (!Array.isArray(unavailableItems) || unavailableItems.some((item) => typeof item !== 'string' || !items.some((menuItem) => menuItem.trim() === item))) return res.status(400).json({ error: 'Unavailable items must match items on this meal menu.' });
    const db = await readDatabase();
    if (db.meals.some((meal) => meal.date === date && meal.type === type)) return res.status(409).json({ error: `A ${type.toLowerCase()} meal already exists for that date.` });
    const students = db.users.filter((user) => user.role === 'student');
    const meal = { id: randomUUID(), date, type, time, items: items.map((item) => item.trim()), unavailableItems: [...new Set(unavailableItems)], actualConsumed: null, rsvps: students.map((student) => ({ studentId: student.id, status: 'no', updatedAt: new Date().toISOString() })) };
    db.meals.push(meal);
    await writeDatabase(db);
    return res.status(201).json({ meal });
  } catch (error) { return next(error); }
});

app.put('/api/meals/:id', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { time, items, unavailableItems = [] } = req.body;
    if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time) || !Array.isArray(items) || items.length > 20 || items.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > 60)) return res.status(400).json({ error: 'Provide a valid time and up to 20 menu items.' });
    if (!Array.isArray(unavailableItems) || unavailableItems.some((item) => typeof item !== 'string' || !items.some((menuItem) => menuItem.trim() === item))) return res.status(400).json({ error: 'Unavailable items must match items on this meal menu.' });
    const db = await readDatabase();
    const meal = db.meals.find((entry) => entry.id === req.params.id);
    if (!meal) return res.status(404).json({ error: 'Meal not found.' });
    meal.time = time;
    meal.items = items.map((item) => item.trim());
    meal.unavailableItems = [...new Set(unavailableItems)];
    await writeDatabase(db);
    const { rsvps, ...mealDetails } = meal;
    return res.json({ meal: mealDetails });
  } catch (error) { return next(error); }
});

app.delete('/api/meals/:id', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const db = await readDatabase();
    const index = db.meals.findIndex((entry) => entry.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Meal not found.' });
    db.meals.splice(index, 1);
    await writeDatabase(db);
    return res.json({ deleted: true });
  } catch (error) { return next(error); }
});

app.get('/api/analytics', requireAuth, requireRole('manager'), async (_req, res, next) => {
  try {
    const db = await readDatabase();
    const meals = db.meals.filter((meal) => meal.date < today() || meal.actualConsumed !== null).sort(byDateThenTime);
    const rows = meals.map((meal) => {
      const expected = meal.rsvps.filter(isExpected).length;
      const consumed = meal.actualConsumed ?? 0;
      return { id: meal.id, date: meal.date, type: meal.type, expected, consumed, unused: Math.max(0, expected - consumed), savedKg: Number((meal.rsvps.filter((entry) => entry.status === 'cancelled').length * 0.45).toFixed(1)) };
    }).reverse();
    const totals = rows.reduce((sum, row) => ({ expected: sum.expected + row.expected, consumed: sum.consumed + row.consumed, unused: sum.unused + row.unused, savedKg: sum.savedKg + row.savedKg }), { expected: 0, consumed: 0, unused: 0, savedKg: 0 });
    return res.json({ rows, totals: { ...totals, savedKg: Number(totals.savedKg.toFixed(1)) } });
  } catch (error) { return next(error); }
});

app.get('/api/circularity', requireAuth, requireRole('manager'), async (_req, res, next) => {
  try {
    const db = await readDatabase();
    const meals = db.meals.filter((meal) => meal.date <= today()).sort(byDateThenTime).reverse().map((meal) => ({
      id: meal.id,
      date: meal.date,
      type: meal.type,
      actualConsumed: meal.actualConsumed,
      expected: meal.rsvps.filter(isExpected).length,
    }));
    const batches = db.compostBatches.map((batch) => {
      const movements = db.compostMovements.filter((movement) => movement.batchId === batch.id);
      const farmKg = movements.filter((movement) => movement.type === 'farm').reduce((sum, movement) => sum + movement.quantityKg, 0);
      const soldKg = movements.filter((movement) => movement.type === 'sale').reduce((sum, movement) => sum + movement.quantityKg, 0);
      const revenue = movements.filter((movement) => movement.type === 'sale').reduce((sum, movement) => sum + movement.revenue, 0);
      return { ...batch, farmKg, soldKg, revenue, remainingKg: Number((batch.compostKg - farmKg - soldKg).toFixed(2)), movements };
    }).sort((a, b) => b.processedOn.localeCompare(a.processedOn));
    const totals = batches.reduce((sum, batch) => ({
      staleFoodKg: sum.staleFoodKg + batch.staleFoodKg,
      compostKg: sum.compostKg + batch.compostKg,
      farmKg: sum.farmKg + batch.farmKg,
      soldKg: sum.soldKg + batch.soldKg,
      revenue: sum.revenue + batch.revenue,
      productionCost: sum.productionCost + batch.productionCost,
    }), { staleFoodKg: 0, compostKg: 0, farmKg: 0, soldKg: 0, revenue: 0, productionCost: 0 });
    let alertsUpdated = false;
    for (const alert of db.surplusAlerts) {
      alert.status ||= 'awaiting_response';
      alert.collectedPortions ??= 0;
      if (['awaiting_response', 'accepted'].includes(alert.status) && Date.parse(alert.pickupBy) <= Date.now()) {
        alert.status = 'expired';
        alert.updatedAt = new Date().toISOString();
        alertsUpdated = true;
      }
    }
    if (alertsUpdated) await writeDatabase(db);
    return res.json({
      meals,
      partners: db.partners.slice().sort((a, b) => a.distanceKm - b.distanceKm),
      alerts: db.surplusAlerts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      batches,
      totals: { ...totals, estimatedMargin: Number((totals.revenue - totals.productionCost).toFixed(2)) },
    });
  } catch (error) { return next(error); }
});

app.post('/api/partners', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { name, contactName = '', email, phone = '', area, distanceKm } = req.body;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) return res.status(400).json({ error: 'Organization name must be between 2 and 100 characters.' });
    if (typeof contactName !== 'string' || contactName.trim().length > 80) return res.status(400).json({ error: 'Contact name must be 80 characters or fewer.' });
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'Enter a valid partner email address.' });
    if (typeof phone !== 'string' || phone.length > 30 || (phone && !/^[+()\d .-]{7,30}$/.test(phone))) return res.status(400).json({ error: 'Enter a valid phone number or leave it blank.' });
    if (typeof area !== 'string' || area.trim().length < 2 || area.trim().length > 120) return res.status(400).json({ error: 'Enter the nearby area or service location.' });
    if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 500) return res.status(400).json({ error: 'Distance must be between 0 and 500 km.' });
    const db = await readDatabase();
    if (db.partners.some((partner) => partner.email.toLowerCase() === email.trim().toLowerCase())) return res.status(409).json({ error: 'A partner with this email is already in the directory.' });
    const partner = { id: randomUUID(), name: name.trim(), contactName: contactName.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), area: area.trim(), distanceKm, createdAt: new Date().toISOString() };
    db.partners.push(partner);
    await writeDatabase(db);
    return res.status(201).json({ partner });
  } catch (error) { return next(error); }
});

app.delete('/api/partners/:id', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const db = await readDatabase();
    const index = db.partners.findIndex((partner) => partner.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Partner not found.' });
    db.partners.splice(index, 1);
    await writeDatabase(db);
    return res.json({ deleted: true });
  } catch (error) { return next(error); }
});

app.post('/api/surplus-alerts', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { mealId, portions, pickupLocation, pickupBy, partnerIds, notes = '', foodSafeConfirmed } = req.body;
    if (typeof mealId !== 'string') return res.status(400).json({ error: 'Select the meal with surplus portions.' });
    if (!Number.isInteger(portions) || portions < 1 || portions > 10000) return res.status(400).json({ error: 'Surplus portions must be a whole number from 1 to 10,000.' });
    if (typeof pickupLocation !== 'string' || pickupLocation.trim().length < 3 || pickupLocation.trim().length > 200) return res.status(400).json({ error: 'Enter a pickup location between 3 and 200 characters.' });
    if (typeof pickupBy !== 'string' || !Number.isFinite(Date.parse(pickupBy)) || Date.parse(pickupBy) <= Date.now()) return res.status(400).json({ error: 'Choose a pickup deadline in the future.' });
    if (!Array.isArray(partnerIds) || partnerIds.length < 1 || partnerIds.length > 50 || partnerIds.some((id) => typeof id !== 'string')) return res.status(400).json({ error: 'Select at least one nearby organization to notify.' });
    if (typeof notes !== 'string' || notes.length > 500) return res.status(400).json({ error: 'Pickup notes must be 500 characters or fewer.' });
    if (foodSafeConfirmed !== true) return res.status(400).json({ error: 'Confirm the food is safe and suitable for donation before sharing an alert.' });
    const db = await readDatabase();
    const meal = db.meals.find((entry) => entry.id === mealId);
    if (!meal || meal.date > today()) return res.status(404).json({ error: 'Choose a meal that has already been served.' });
    if (meal.actualConsumed === null) return res.status(400).json({ error: 'Record the meal’s consumed plate count before listing surplus portions.' });
    const uniquePartnerIds = new Set(partnerIds);
    const selectedPartners = db.partners.filter((partner) => uniquePartnerIds.has(partner.id));
    if (!selectedPartners.length || selectedPartners.length !== partnerIds.length) return res.status(400).json({ error: 'One or more selected organizations are duplicated or no longer in the partner directory.' });
    const alert = {
      id: randomUUID(),
      mealId: meal.id,
      mealType: meal.type,
      mealDate: meal.date,
      portions,
      pickupLocation: pickupLocation.trim(),
      pickupBy: new Date(pickupBy).toISOString(),
      partnerIds: selectedPartners.map((partner) => partner.id),
      recipients: selectedPartners.map(({ id, name, email, area, distanceKm }) => ({ id, name, email, area, distanceKm })),
      notes: notes.trim(),
      foodSafeConfirmed: true,
      status: 'awaiting_response',
      collectedPortions: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.surplusAlerts.push(alert);
    await writeDatabase(db);
    return res.status(201).json({ alert });
  } catch (error) { return next(error); }
});

app.patch('/api/surplus-alerts/:id', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { status, collectedPortions } = req.body;
    if (!['accepted', 'picked_up', 'expired'].includes(status)) return res.status(400).json({ error: 'Choose accepted, picked up, or expired.' });
    const db = await readDatabase();
    const alert = db.surplusAlerts.find((entry) => entry.id === req.params.id);
    if (!alert) return res.status(404).json({ error: 'Surplus offer not found.' });
    alert.status ||= 'awaiting_response';
    alert.collectedPortions ??= 0;
    if (!['awaiting_response', 'accepted'].includes(alert.status)) return res.status(409).json({ error: 'This surplus offer is already closed.' });
    if (Date.parse(alert.pickupBy) <= Date.now() && status !== 'expired') {
      alert.status = 'expired';
      alert.updatedAt = new Date().toISOString();
      await writeDatabase(db);
      return res.status(409).json({ error: 'The pickup deadline passed, so this offer is expired.' });
    }
    if (status === 'picked_up') {
      if (alert.status !== 'accepted') return res.status(409).json({ error: 'Record partner acceptance before marking the offer picked up.' });
      if (!Number.isInteger(collectedPortions) || collectedPortions < 1 || collectedPortions > alert.portions) return res.status(400).json({ error: `Collected portions must be a whole number from 1 to ${alert.portions}.` });
      alert.collectedPortions = collectedPortions;
    } else if (status === 'accepted' && alert.status !== 'awaiting_response') {
      return res.status(409).json({ error: 'This offer cannot be accepted in its current status.' });
    } else if (status === 'expired' && Date.parse(alert.pickupBy) > Date.now() && req.body.confirmExpired !== true) {
      return res.status(400).json({ error: 'The pickup deadline has not passed. Confirm early expiry explicitly.' });
    }
    alert.status = status;
    alert.updatedAt = new Date().toISOString();
    await writeDatabase(db);
    return res.json({ alert });
  } catch (error) { return next(error); }
});

app.post('/api/compost-batches', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { sourceMealId = '', staleFoodKg, compostKg, processedOn, readyOn, productionCost, notes = '' } = req.body;
    if (sourceMealId !== '' && typeof sourceMealId !== 'string') return res.status(400).json({ error: 'Choose a valid source meal.' });
    if (typeof staleFoodKg !== 'number' || !Number.isFinite(staleFoodKg) || staleFoodKg <= 0 || staleFoodKg > 10000) return res.status(400).json({ error: 'Stale food weight must be greater than 0 and no more than 10,000 kg.' });
    if (typeof compostKg !== 'number' || !Number.isFinite(compostKg) || compostKg <= 0 || compostKg > staleFoodKg) return res.status(400).json({ error: 'Ready compost weight must be greater than 0 and no more than the stale food weight.' });
    if (typeof processedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(processedOn) || processedOn > today()) return res.status(400).json({ error: 'Enter a valid processing date no later than today.' });
    if (typeof readyOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(readyOn) || readyOn < processedOn) return res.status(400).json({ error: 'Compost ready date must be on or after its processing date.' });
    if (typeof productionCost !== 'number' || !Number.isFinite(productionCost) || productionCost < 0 || productionCost > 100000000) return res.status(400).json({ error: 'Enter a valid production cost (zero is allowed).' });
    if (typeof notes !== 'string' || notes.length > 500) return res.status(400).json({ error: 'Batch notes must be 500 characters or fewer.' });
    const db = await readDatabase();
    if (sourceMealId && !db.meals.some((meal) => meal.id === sourceMealId && meal.date <= today())) return res.status(400).json({ error: 'Choose an existing served meal as the source.' });
    const batch = { id: randomUUID(), sourceMealId, staleFoodKg, compostKg, processedOn, readyOn, productionCost, notes: notes.trim(), createdAt: new Date().toISOString() };
    db.compostBatches.push(batch);
    await writeDatabase(db);
    return res.status(201).json({ batch });
  } catch (error) { return next(error); }
});

app.post('/api/compost-batches/:id/movements', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { type, quantityKg, date, revenue = 0, notes = '' } = req.body;
    if (!['farm', 'sale'].includes(type)) return res.status(400).json({ error: 'Choose farm use or market sale.' });
    if (typeof quantityKg !== 'number' || !Number.isFinite(quantityKg) || quantityKg <= 0 || quantityKg > 10000) return res.status(400).json({ error: 'Movement weight must be greater than 0 and no more than 10,000 kg.' });
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) return res.status(400).json({ error: 'Enter a valid movement date no later than today.' });
    if (typeof revenue !== 'number' || !Number.isFinite(revenue) || revenue < 0 || revenue > 100000000 || (type === 'farm' && revenue !== 0)) return res.status(400).json({ error: 'Enter valid sale proceeds. Farm use must not include sale proceeds.' });
    if (type === 'sale' && revenue <= 0) return res.status(400).json({ error: 'Enter the actual sale proceeds for a market sale.' });
    if (typeof notes !== 'string' || notes.length > 500) return res.status(400).json({ error: 'Movement notes must be 500 characters or fewer.' });
    const db = await readDatabase();
    const batch = db.compostBatches.find((entry) => entry.id === req.params.id);
    if (!batch) return res.status(404).json({ error: 'Compost batch not found.' });
    if (date < batch.readyOn) return res.status(400).json({ error: `This batch is not ready for use or sale until ${batch.readyOn}.` });
    const usedKg = db.compostMovements.filter((entry) => entry.batchId === batch.id).reduce((sum, entry) => sum + entry.quantityKg, 0);
    const remainingKg = Number((batch.compostKg - usedKg).toFixed(2));
    if (quantityKg > remainingKg) return res.status(400).json({ error: `Only ${remainingKg} kg of this batch is available.` });
    const movement = { id: randomUUID(), batchId: batch.id, type, quantityKg, date, revenue, notes: notes.trim(), createdAt: new Date().toISOString() };
    db.compostMovements.push(movement);
    await writeDatabase(db);
    return res.status(201).json({ movement, remainingKg: Number((remainingKg - quantityKg).toFixed(2)) });
  } catch (error) { return next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  return res.status(500).json({ error: 'Something went wrong while processing your request.' });
});

await initializeDatabase();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '..', 'dist')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }

  return res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});
app.listen(port, () => console.log(`Shivalik Mess Meter API listening on http://localhost:${port}`));

function dateOffset(offset) {
  const date = new Date(`${today()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
