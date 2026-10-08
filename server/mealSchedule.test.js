import test from 'node:test';
import assert from 'node:assert/strict';
import { indiaToday, mealQrWindow, mealSelectionWindow } from './mealSchedule.js';

const at = (date, time) => new Date(`${date}T${time}:00+05:30`);

test('selection cutoffs follow the agreed India-time meal windows', () => {
  const breakfast = { type: 'Breakfast', date: '2026-10-09', time: '07:30' };
  assert.equal(mealSelectionWindow(breakfast, at('2026-10-08', '23:59')).isOpen, true);
  assert.equal(mealSelectionWindow(breakfast, at('2026-10-09', '00:00')).isOpen, false);

  const lunch = { type: 'Lunch', date: '2026-10-09', time: '12:30' };
  assert.equal(mealSelectionWindow(lunch, at('2026-10-09', '05:59')).isOpen, false);
  assert.equal(mealSelectionWindow(lunch, at('2026-10-09', '06:00')).isOpen, true);
  assert.equal(mealSelectionWindow(lunch, at('2026-10-09', '10:00')).isOpen, true);
  assert.equal(mealSelectionWindow(lunch, at('2026-10-09', '10:01')).isOpen, false);

  const snacks = { type: 'Snacks', date: '2026-10-09', time: '16:30' };
  assert.equal(mealSelectionWindow(snacks, at('2026-10-09', '12:59')).isOpen, false);
  assert.equal(mealSelectionWindow(snacks, at('2026-10-09', '13:00')).isOpen, true);
  assert.equal(mealSelectionWindow(snacks, at('2026-10-09', '14:30')).isOpen, true);
  assert.equal(mealSelectionWindow(snacks, at('2026-10-09', '14:31')).isOpen, false);

  const dinner = { type: 'Dinner', date: '2026-10-09', time: '19:30' };
  assert.equal(mealSelectionWindow(dinner, at('2026-10-09', '14:59')).isOpen, false);
  assert.equal(mealSelectionWindow(dinner, at('2026-10-09', '15:00')).isOpen, true);
  assert.equal(mealSelectionWindow(dinner, at('2026-10-09', '16:30')).isOpen, true);
  assert.equal(mealSelectionWindow(dinner, at('2026-10-09', '16:31')).isOpen, false);
});

test('meal QR redemption opens 15 minutes before service and expires 90 minutes after', () => {
  const { opensAt, expiresAt } = mealQrWindow({ type: 'Lunch', date: '2026-10-09', time: '12:30' });
  assert.equal(opensAt.toISOString(), at('2026-10-09', '12:15').toISOString());
  assert.equal(expiresAt.toISOString(), at('2026-10-09', '14:00').toISOString());
});

test('business calendar date is reported in India time', () => {
  assert.equal(indiaToday(new Date('2026-10-07T20:00:00.000Z')), '2026-10-08');
});
