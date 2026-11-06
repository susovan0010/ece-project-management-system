// ==========================================
// ECE Capstone Project Management System
// Communication Scheduler Engine (Pure Functions)
// ==========================================

export type ScheduleTimeMode = 'SPECIFIC' | 'RANDOM_WINDOW';
export type ScheduleOccurrenceStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
export type ScheduleJobStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface ScheduleRandomWindow {
  startTime: string; // "HH:MM" e.g. "09:00"
  endTime: string;   // "HH:MM" e.g. "18:00"
}

export interface ScheduleOccurrence {
  id: string;
  scheduledAt: string; // ISO 8601 string
  status: ScheduleOccurrenceStatus;
  sentAt?: string;
  error?: string;
}

export interface ScheduleConfigInput {
  startDate: string;        // "YYYY-MM-DD"
  endDate: string;          // "YYYY-MM-DD"
  frequencyPerDay: number;  // 1, 2, or 3 (max 3 times)
  timeMode: ScheduleTimeMode;
  specificTimes?: string[]; // e.g. ["10:00", "14:30"]
  randomWindow?: ScheduleRandomWindow;
}

export interface ScheduleValidationResult {
  valid: boolean;
  error?: string;
  cleanConfig?: {
    startDate: string;
    endDate: string;
    frequencyPerDay: number;
    timeMode: ScheduleTimeMode;
    specificTimes: string[];
    randomWindow: ScheduleRandomWindow;
  };
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converts "HH:MM" string to minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converts minutes from midnight to "HH:MM" string
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Validates schedule inputs according to user boundary rules
 */
export function validateScheduleConfig(input: Partial<ScheduleConfigInput>): ScheduleValidationResult {
  if (!input.startDate || !DATE_REGEX.test(input.startDate)) {
    return { valid: false, error: 'Please provide a valid start date (YYYY-MM-DD).' };
  }

  if (!input.endDate || !DATE_REGEX.test(input.endDate)) {
    return { valid: false, error: 'Please provide a valid end date (YYYY-MM-DD).' };
  }

  if (input.startDate > input.endDate) {
    return { valid: false, error: 'Start date cannot be after end date.' };
  }

  const freq = Number(input.frequencyPerDay);
  if (!freq || freq < 1 || freq > 3) {
    return { valid: false, error: 'Daily frequency must be between 1 and 3 times per day (maximum 3 times).' };
  }

  const timeMode = input.timeMode === 'RANDOM_WINDOW' ? 'RANDOM_WINDOW' : 'SPECIFIC';

  const defaultWindow: ScheduleRandomWindow = {
    startTime: input.randomWindow?.startTime || '09:00',
    endTime: input.randomWindow?.endTime || '18:00',
  };

  if (timeMode === 'RANDOM_WINDOW') {
    if (!TIME_REGEX.test(defaultWindow.startTime) || !TIME_REGEX.test(defaultWindow.endTime)) {
      return { valid: false, error: 'Random window start and end times must be in HH:MM format.' };
    }

    const startMin = timeToMinutes(defaultWindow.startTime);
    const endMin = timeToMinutes(defaultWindow.endTime);

    if (startMin >= endMin) {
      return { valid: false, error: 'Random window start time must be earlier than end time.' };
    }

    if (endMin - startMin < freq * 20) {
      return { valid: false, error: `Random window is too narrow for ${freq} distinct dispatches.` };
    }
  } else {
    // SPECIFIC mode
    const times = (input.specificTimes || []).map((t) => t.trim()).filter(Boolean);
    if (times.length === 0) {
      return { valid: false, error: 'Please specify at least one time of day for delivery.' };
    }

    for (const t of times) {
      if (!TIME_REGEX.test(t)) {
        return { valid: false, error: `Invalid time format: "${t}". Expected HH:MM.` };
      }
    }
  }

  const cleanTimes = (input.specificTimes || ['10:00', '14:00', '17:00'])
    .slice(0, freq)
    .sort();

  return {
    valid: true,
    cleanConfig: {
      startDate: input.startDate,
      endDate: input.endDate,
      frequencyPerDay: freq,
      timeMode,
      specificTimes: cleanTimes,
      randomWindow: defaultWindow,
    },
  };
}

/**
 * Generates the daily time slots for a specific day
 */
export function generateDailyTimeSlots(
  frequency: number,
  timeMode: ScheduleTimeMode,
  specificTimes: string[],
  randomWindow: ScheduleRandomWindow,
  rngSeed = Math.random
): string[] {
  if (timeMode === 'SPECIFIC') {
    return [...specificTimes].slice(0, frequency).sort();
  }

  // RANDOM_WINDOW: generate frequency spaced random times
  const startMin = timeToMinutes(randomWindow.startTime);
  const endMin = timeToMinutes(randomWindow.endTime);
  const totalSpan = endMin - startMin;
  const bucketSize = Math.floor(totalSpan / frequency);

  const times: string[] = [];
  for (let i = 0; i < frequency; i++) {
    const bucketStart = startMin + i * bucketSize;
    const bucketEnd = startMin + (i + 1) * bucketSize;
    const offset = Math.floor(rngSeed() * Math.max(1, bucketEnd - bucketStart));
    const chosenMinute = Math.min(endMin, bucketStart + offset);
    times.push(minutesToTime(chosenMinute));
  }

  return times.sort();
}

/**
 * Generates all occurrence dates & times from startDate through endDate
 */
export function generateScheduleOccurrences(
  startDate: string,
  endDate: string,
  frequency: number,
  timeMode: ScheduleTimeMode,
  specificTimes: string[],
  randomWindow: ScheduleRandomWindow,
  rngSeed = Math.random
): ScheduleOccurrence[] {
  const occurrences: ScheduleOccurrence[] = [];
  let current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);

  let occurrenceIndex = 1;

  while (current <= end) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const dailySlots = generateDailyTimeSlots(
      frequency,
      timeMode,
      specificTimes,
      randomWindow,
      rngSeed
    );

    for (const timeStr of dailySlots) {
      occurrences.push({
        id: `occ-${occurrenceIndex++}`,
        scheduledAt: `${dateStr}T${timeStr}:00`,
        status: 'PENDING',
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return occurrences;
}

/**
 * Calculates the next pending execution timestamp
 */
export function calculateNextRun(
  occurrences: ScheduleOccurrence[],
  now = new Date()
): ScheduleOccurrence | null {
  const nowMs = now.getTime();
  const pending = occurrences
    .filter((o) => o.status === 'PENDING' && new Date(o.scheduledAt).getTime() >= nowMs)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return pending[0] || null;
}

/**
 * Finds all occurrences that are due for dispatch (scheduledAt <= now and PENDING)
 */
export function getDueOccurrences(
  occurrences: ScheduleOccurrence[],
  now = new Date()
): ScheduleOccurrence[] {
  const nowMs = now.getTime();
  return occurrences.filter((o) => o.status === 'PENDING' && new Date(o.scheduledAt).getTime() <= nowMs);
}
