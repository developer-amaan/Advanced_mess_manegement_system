import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indiaToday } from './mealSchedule.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test('mobile/tunnel origins can sign in through the API', { timeout: 30000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shivalik-mealmeter-'));
  const dbPath = path.join(directory, 'integration-db.json');
  const port = await availablePort();
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), MESSMETER_DB_PATH: dbPath },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let serverOutput = '';
  server.stderr.setEncoding('utf8');
  server.stderr.on('data', (chunk) => { serverOutput += chunk; });

  try {
    let healthy = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`API process exited: ${serverOutput}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: 'https://demo.trycloudflare.com' } });
        if (response.ok) { healthy = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(healthy, true, `API did not start: ${serverOutput}`);

    const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://demo.trycloudflare.com',
      },
      body: JSON.stringify({ email: 'student@messmeter.local', password: 'student123' }),
    });
    assert.equal(response.status, 200, `Login should be allowed from a tunnel origin: ${response.status} ${serverOutput}`);
    const body = await response.json();
    assert.ok(body.token);
    assert.equal(body.user.email, 'student@messmeter.local');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://demo.trycloudflare.com');
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('manager scan redeems a student meal QR exactly once', { timeout: 30000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shivalik-mealmeter-'));
  const dbPath = path.join(directory, 'integration-db.json');
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), MESSMETER_DB_PATH: dbPath },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let serverOutput = '';
  server.stderr.setEncoding('utf8');
  server.stderr.on('data', (chunk) => { serverOutput += chunk; });

  const request = async (route, token, method = 'GET', payload) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    let healthy = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`API process exited: ${serverOutput}`);
      try {
        const response = await fetch(`${baseUrl}/health`);
        if (response.ok) { healthy = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(healthy, true, `API did not start: ${serverOutput}`);

    const studentLogin = await request('/auth/login', null, 'POST', { email: 'student@messmeter.local', password: 'student123' });
    const managerLogin = await request('/auth/login', null, 'POST', { email: 'manager@messmeter.local', password: 'manager123' });
    assert.equal(studentLogin.status, 200);
    assert.equal(managerLogin.status, 200);
    const managerToken = managerLogin.body.token;
    assert.equal(managerLogin.body.user.name, 'Diablo');

    const registered = await request('/auth/register', null, 'POST', {
      name: 'QR Test Student',
      email: `qr-test-${Date.now()}@messmeter.local`,
      password: 'secureqr123',
      room: 'QR-101',
    });
    assert.equal(registered.status, 201, registered.body.error);
    const studentToken = registered.body.token;

    let db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
    const tomorrowDate = new Date(`${indiaToday()}T12:00:00Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    let meal = db.meals.find((entry) => entry.date === tomorrowDate.toISOString().slice(0, 10) && entry.type === 'Breakfast');
    assert.ok(meal, 'Seeded meals should include tomorrow’s breakfast');
    const dashboard = await request('/dashboard/manager', managerToken);
    assert.ok(Number.isInteger(dashboard.body.stats.checkedIn));
    assert.ok(dashboard.body.todayMeals.every((entry) => Number.isInteger(entry.recommendedPrep) && Number.isInteger(entry.checkedIn)));
    assert.ok(dashboard.body.todayMeals.every((entry) => entry.recommendedPrep === Math.ceil(entry.expected * 1.05)));
    const additionalDate = new Date(`${indiaToday()}T12:00:00Z`);
    additionalDate.setUTCDate(additionalDate.getUTCDate() + 8);
    const addedMeal = await request('/meals', managerToken, 'POST', { date: additionalDate.toISOString().slice(0, 10), type: 'Dinner', time: '19:30', items: ['Rice', 'Dal'], unavailableItems: ['Dal'] });
    assert.equal(addedMeal.status, 201, addedMeal.body.error);
    assert.deepEqual(addedMeal.body.meal.unavailableItems, ['Dal']);
    const menuUpdate = await request(`/meals/${meal.id}`, managerToken, 'PUT', { time: meal.time, items: ['Updated oats', 'Tea'], unavailableItems: ['Updated oats'] });
    assert.equal(menuUpdate.status, 200, menuUpdate.body.error);
    assert.deepEqual(menuUpdate.body.meal.unavailableItems, ['Updated oats']);
    const invalidMenuUpdate = await request(`/meals/${meal.id}`, managerToken, 'PUT', { time: meal.time, items: ['Tea'], unavailableItems: ['Missing item'] });
    assert.equal(invalidMenuUpdate.status, 400);
    const mealList = await request('/meals', studentToken);
    const mealForStudent = mealList.body.meals.find((entry) => entry.id === meal.id);
    assert.equal(mealForStudent.selectionOpen, true, 'Breakfast selection is open until the previous night’s cutoff');
    assert.deepEqual(mealForStudent.unavailableItems, ['Updated oats']);
    assert.equal(Object.hasOwn(mealForStudent, 'rsvps'), false);

    const reservation = await request(`/meals/${meal.id}/rsvp`, studentToken, 'PUT', { status: 'yes' });
    assert.equal(reservation.status, 200, reservation.body.error);
    assert.equal(reservation.body.status, 'yes');
    assert.match(reservation.body.qrToken, /^[A-Za-z0-9_-]{40,50}$/);
    const earlyScan = await request('/attendance/scan', managerToken, 'POST', { token: reservation.body.qrToken });
    assert.equal(earlyScan.status, 400, `The pass must not check in before the meal scan window: ${JSON.stringify(earlyScan.body)} ${serverOutput}`);

    const rotatedPass = await request(`/meals/${meal.id}/qr`, studentToken, 'POST');
    assert.equal(rotatedPass.status, 200, rotatedPass.body.error);
    assert.notEqual(rotatedPass.body.token, reservation.body.qrToken);

    db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
    meal = db.meals.find((entry) => entry.id === meal.id);
    meal.date = indiaToday();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour').value);
    const minute = Number(parts.find((part) => part.type === 'minute').value);
    const currentMinutes = hour * 60 + minute;
    const servingMinutes = currentMinutes < 10 ? currentMinutes + 5 : currentMinutes - 5;
    meal.time = `${String(Math.floor(servingMinutes / 60)).padStart(2, '0')}:${String(servingMinutes % 60).padStart(2, '0')}`;
    const rsvp = meal.rsvps.find((entry) => entry.studentId === registered.body.user.id);
    assert.ok(rsvp, 'Newly registered students need RSVP records for upcoming meals');
    assert.equal(rsvp.qrTokenHash, createHash('sha256').update(rotatedPass.body.token).digest('hex'));
    rsvp.qrRedeemedAt = null;
    meal.actualConsumed = null;
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8');

    const oldCode = await request('/attendance/scan', managerToken, 'POST', { token: reservation.body.qrToken });
    assert.equal(oldCode.status, 404, 'Replacing a QR pass invalidates its previous code');
    const redeemed = await request('/attendance/scan', managerToken, 'POST', { token: rotatedPass.body.token });
    assert.equal(redeemed.status, 200, `${redeemed.body.error || ''} ${serverOutput}`);
    assert.equal(redeemed.body.accepted, true);
    assert.equal(redeemed.body.student.name, registered.body.user.name);
    assert.equal(redeemed.body.actualConsumed, 1);

    const repeated = await request('/attendance/scan', managerToken, 'POST', { token: rotatedPass.body.token });
    assert.equal(repeated.status, 404);
    assert.match(repeated.body.error, /already been used/);

    const meals = await request('/meals', studentToken);
    const studentMeal = meals.body.meals.find((entry) => entry.id === meal.id);
    assert.equal(studentMeal.myStatus, 'attended');
    assert.equal(Object.hasOwn(studentMeal, 'rsvps'), false);
    assert.equal(Object.hasOwn(studentMeal, 'qrTokenHash'), false);

    const partner = await request('/partners', managerToken, 'POST', { name: 'Local Food Group', email: 'rescue@example.org', area: 'Campus road', distanceKm: 2.5 });
    assert.equal(partner.status, 201, partner.body.error);
    const pastMeal = db.meals.find((entry) => entry.date < indiaToday() && entry.actualConsumed !== null);
    assert.ok(pastMeal, 'Seeded data should include a served meal for rescue testing');
    const pickupBy = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const offer = await request('/surplus-alerts', managerToken, 'POST', { mealId: pastMeal.id, portions: 12, pickupLocation: 'Mess gate', pickupBy, partnerIds: [partner.body.partner.id], foodSafeConfirmed: true });
    assert.equal(offer.status, 201, offer.body.error);
    assert.equal(offer.body.alert.status, 'awaiting_response');
    const pickupBeforeAcceptance = await request(`/surplus-alerts/${offer.body.alert.id}`, managerToken, 'PATCH', { status: 'picked_up', collectedPortions: 10 });
    assert.equal(pickupBeforeAcceptance.status, 409);
    const accepted = await request(`/surplus-alerts/${offer.body.alert.id}`, managerToken, 'PATCH', { status: 'accepted' });
    assert.equal(accepted.status, 200, accepted.body.error);
    const invalidCollectedCount = await request(`/surplus-alerts/${offer.body.alert.id}`, managerToken, 'PATCH', { status: 'picked_up', collectedPortions: 13 });
    assert.equal(invalidCollectedCount.status, 400);
    const pickedUp = await request(`/surplus-alerts/${offer.body.alert.id}`, managerToken, 'PATCH', { status: 'picked_up', collectedPortions: 10 });
    assert.equal(pickedUp.status, 200, pickedUp.body.error);
    assert.equal(pickedUp.body.alert.collectedPortions, 10);
    const circularity = await request('/circularity', managerToken);
    const savedOffer = circularity.body.alerts.find((entry) => entry.id === offer.body.alert.id);
    assert.equal(savedOffer.status, 'picked_up');
    assert.equal(savedOffer.collectedPortions, 10);
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});
