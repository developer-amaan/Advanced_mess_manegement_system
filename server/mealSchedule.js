const INDIA_OFFSET = '+05:30';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

function addCalendarDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function indiaDateTime(date, time, seconds = '00') {
  return new Date(`${date}T${time}:${seconds}${INDIA_OFFSET}`);
}

export function indiaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function mealSelectionWindow(meal, now = new Date()) {
  if (!meal || !datePattern.test(meal.date) || !timePattern.test(meal.time)) {
    throw new Error('Meal must have a valid date and serving time.');
  }

  let openDate = meal.date;
  let openTime = '00:00';
  let closeDate = meal.date;
  let closeTime = '00:00';

  if (meal.type === 'Breakfast') {
    openDate = addCalendarDays(meal.date, -1);
    closeDate = openDate;
    closeTime = '23:59';
  } else if (meal.type === 'Lunch') {
    openTime = '06:00';
    closeTime = '10:00';
  } else if (meal.type === 'Snacks') {
    openTime = '13:00';
    closeTime = '14:30';
  } else if (meal.type === 'Dinner') {
    openTime = '15:00';
    closeTime = '16:30';
  } else {
    throw new Error('Meal has an unsupported meal type.');
  }

  const opensAt = indiaDateTime(openDate, openTime);
  const closesAt = indiaDateTime(closeDate, closeTime, '59.999');
  return { opensAt, closesAt, isOpen: now >= opensAt && now <= closesAt };
}

export function mealQrWindow(meal) {
  if (!meal || !datePattern.test(meal.date) || !timePattern.test(meal.time)) {
    throw new Error('Meal must have a valid date and serving time.');
  }
  const servingAt = indiaDateTime(meal.date, meal.time);
  return {
    opensAt: new Date(servingAt.getTime() - 15 * 60 * 1000),
    expiresAt: new Date(servingAt.getTime() + 90 * 60 * 1000),
  };
}
