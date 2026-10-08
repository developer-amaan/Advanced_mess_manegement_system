import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { indiaToday } from './mealSchedule.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.MESSMETER_DB_PATH ? path.resolve(process.env.MESSMETER_DB_PATH) : path.join(directory, 'data', 'db.json');

const dateOffset = (offset) => {
  const date = new Date(`${indiaToday()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

const mealNames = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
const menus = {
  Breakfast: ['Poha', 'Boiled eggs', 'Toast & butter', 'Masala chai'],
  Lunch: ['Steamed rice', 'Dal tadka', 'Paneer curry', 'Seasonal salad'],
  Snacks: ['Veg sandwich', 'Banana', 'Tea / coffee'],
  Dinner: ['Jeera rice', 'Chapati', 'Mixed veg curry', 'Curd'],
};

async function createSeed() {
  const [studentHash, managerHash] = await Promise.all([
    bcrypt.hash('student123', 10),
    bcrypt.hash('manager123', 10),
  ]);
  const students = Array.from({ length: 24 }, (_, index) => ({
    id: `student-${index + 1}`,
    name: ['Aarav Sharma', 'Diya Patel', 'Kabir Singh', 'Ananya Rao', 'Ishaan Gupta', 'Meera Nair'][index % 6] + (index >= 6 ? ` ${Math.floor(index / 6) + 1}` : ''),
    email: index === 0 ? 'student@messmeter.local' : `student${String(index + 1).padStart(2, '0')}@messmeter.local`,
    passwordHash: studentHash,
    role: 'student',
    room: `B-${201 + index}`,
  }));
  const meals = [];
  for (let offset = -6; offset <= 7; offset += 1) {
    for (let index = 0; index < mealNames.length; index += 1) {
      const name = mealNames[index];
      const id = `meal-${dateOffset(offset)}-${index}`;
      const isPast = offset < 0;
      const attendees = isPast ? 15 + ((offset + index + 20) % 8) : 0;
      meals.push({
        id,
        date: dateOffset(offset),
        type: name,
        time: ['07:30', '12:30', '16:30', '19:30'][index],
        items: [...menus[name]],
        actualConsumed: isPast ? Math.max(0, attendees - (index % 3)) : null,
        rsvps: students.map((student, studentIndex) => ({
          studentId: student.id,
          status: isPast ? (studentIndex === 0 && (offset + index) % 6 === 0 ? 'cancelled' : studentIndex < attendees ? 'attended' : (studentIndex % 4 === 0 ? 'cancelled' : 'no')) : (studentIndex > 0 && studentIndex <= 15 + ((index * 3) % 9) ? 'yes' : 'no'),
          updatedAt: new Date().toISOString(),
        })),
      });
    }
  }
  return {
    users: [
      ...students,
      { id: 'manager-1', name: 'Diablo', email: 'manager@messmeter.local', passwordHash: managerHash, role: 'manager' },
    ],
    meals,
    partners: [],
    surplusAlerts: [],
    compostBatches: [],
    compostMovements: [],
  };
}

export async function initializeDatabase() {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await writeDatabase(await createSeed());
  }
}

export async function readDatabase() {
  const db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  db.partners ||= [];
  db.surplusAlerts ||= [];
  db.compostBatches ||= [];
  db.compostMovements ||= [];
  return db;
}

export async function writeDatabase(data) {
  const temporaryPath = `${dbPath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temporaryPath, dbPath);
}
