// ========================================================
// ECE Capstone Project Management System - Communication Scheduler Engine Tests
// Tests validation, occurrence generation, daily frequency (max 3), and time window modes.
// ========================================================

import { describe, it, expect } from 'vitest';
import {
  validateScheduleConfig,
  generateDailyTimeSlots,
  generateScheduleOccurrences,
  calculateNextRun,
  getDueOccurrences,
  timeToMinutes,
  minutesToTime,
} from '../lib/engine/communication-scheduler';

describe('Communication Scheduler Engine: Validation', () => {
  it('accepts valid specific times configuration', () => {
    const res = validateScheduleConfig({
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      frequencyPerDay: 2,
      timeMode: 'SPECIFIC',
      specificTimes: ['10:30', '16:00'],
    });

    expect(res.valid).toBe(true);
    expect(res.cleanConfig?.frequencyPerDay).toBe(2);
    expect(res.cleanConfig?.specificTimes).toEqual(['10:30', '16:00']);
  });

  it('accepts valid random window configuration', () => {
    const res = validateScheduleConfig({
      startDate: '2026-11-10',
      endDate: '2026-11-14',
      frequencyPerDay: 3,
      timeMode: 'RANDOM_WINDOW',
      randomWindow: { startTime: '09:00', endTime: '18:00' },
    });

    expect(res.valid).toBe(true);
    expect(res.cleanConfig?.frequencyPerDay).toBe(3);
    expect(res.cleanConfig?.randomWindow.startTime).toBe('09:00');
    expect(res.cleanConfig?.randomWindow.endTime).toBe('18:00');
  });

  it('rejects start date after end date', () => {
    const res = validateScheduleConfig({
      startDate: '2026-11-15',
      endDate: '2026-11-10',
      frequencyPerDay: 1,
      timeMode: 'SPECIFIC',
      specificTimes: ['10:00'],
    });

    expect(res.valid).toBe(false);
    expect(res.error).toContain('Start date cannot be after end date');
  });

  it('rejects daily frequency exceeding 3 times', () => {
    const res = validateScheduleConfig({
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      frequencyPerDay: 4, // Max is 3
      timeMode: 'SPECIFIC',
      specificTimes: ['10:00', '12:00', '14:00', '16:00'],
    });

    expect(res.valid).toBe(false);
    expect(res.error).toContain('maximum 3 times');
  });

  it('rejects invalid random window where start is after end', () => {
    const res = validateScheduleConfig({
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      frequencyPerDay: 2,
      timeMode: 'RANDOM_WINDOW',
      randomWindow: { startTime: '19:00', endTime: '09:00' },
    });

    expect(res.valid).toBe(false);
    expect(res.error).toContain('earlier than end time');
  });
});

describe('Communication Scheduler Engine: Time Slots & Occurrence Generation', () => {
  it('converts between HH:MM and minutes accurately', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);

    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(0)).toBe('00:00');
  });

  it('generates exact specific times in sorted order', () => {
    const slots = generateDailyTimeSlots(
      2,
      'SPECIFIC',
      ['15:45', '10:15', '18:00'],
      { startTime: '09:00', endTime: '18:00' }
    );

    expect(slots.length).toBe(2);
    expect(slots).toEqual(['10:15', '15:45']);
  });

  it('generates random times bounded strictly within window', () => {
    const slots = generateDailyTimeSlots(
      3,
      'RANDOM_WINDOW',
      [],
      { startTime: '10:00', endTime: '17:00' },
      () => 0.5 // deterministic mock seed
    );

    expect(slots.length).toBe(3);
    slots.forEach((slot) => {
      const min = timeToMinutes(slot);
      expect(min).toBeGreaterThanOrEqual(timeToMinutes('10:00'));
      expect(min).toBeLessThanOrEqual(timeToMinutes('17:00'));
    });
  });

  it('generates occurrences across date boundary (e.g. 3 days x 2 times = 6 occurrences)', () => {
    const occurrences = generateScheduleOccurrences(
      '2026-11-10',
      '2026-11-12',
      2,
      'SPECIFIC',
      ['11:00', '16:00'],
      { startTime: '09:00', endTime: '18:00' }
    );

    expect(occurrences.length).toBe(6);
    expect(occurrences[0].scheduledAt).toBe('2026-11-10T11:00:00');
    expect(occurrences[1].scheduledAt).toBe('2026-11-10T16:00:00');
    expect(occurrences[5].scheduledAt).toBe('2026-11-12T16:00:00');
    expect(occurrences.every((o) => o.status === 'PENDING')).toBe(true);
  });

  it('correctly detects due occurrences when current time arrives', () => {
    const occurrences = [
      { id: 'occ-1', scheduledAt: '2026-11-10T10:00:00', status: 'PENDING' as const },
      { id: 'occ-2', scheduledAt: '2026-11-10T14:00:00', status: 'PENDING' as const },
      { id: 'occ-3', scheduledAt: '2026-11-10T18:00:00', status: 'PENDING' as const },
    ];

    const dueAt12 = getDueOccurrences(occurrences, new Date('2026-11-10T12:00:00'));
    expect(dueAt12.length).toBe(1);
    expect(dueAt12[0].id).toBe('occ-1');

    const dueAt15 = getDueOccurrences(occurrences, new Date('2026-11-10T15:00:00'));
    expect(dueAt15.length).toBe(2);

    const nextRun = calculateNextRun(occurrences, new Date('2026-11-10T12:00:00'));
    expect(nextRun?.id).toBe('occ-2');
  });
});
