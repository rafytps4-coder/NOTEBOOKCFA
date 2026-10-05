// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { reminderDue } from './saveArchive';

const DAY = 86_400_000;
const base = {
  days: 7,
  lastBackupAt: null as number | null,
  firstRunAt: 0,
  dismissedAt: null as number | null,
};

describe('backup reminder', () => {
  it('is off when days is 0', () => {
    expect(reminderDue({ ...base, days: 0, now: 100 * DAY })).toBe(false);
  });
  it('counts from first run until a backup exists', () => {
    expect(reminderDue({ ...base, now: 3 * DAY })).toBe(false);
    expect(reminderDue({ ...base, now: 8 * DAY })).toBe(true);
  });
  it('counts from the last backup once there is one', () => {
    expect(reminderDue({ ...base, lastBackupAt: 7 * DAY, now: 10 * DAY })).toBe(false);
    expect(reminderDue({ ...base, lastBackupAt: 7 * DAY, now: 15 * DAY })).toBe(true);
  });
  it('stays quiet for a day after being dismissed', () => {
    expect(reminderDue({ ...base, dismissedAt: 8 * DAY, now: 8.5 * DAY })).toBe(false);
    expect(reminderDue({ ...base, dismissedAt: 8 * DAY, now: 9.5 * DAY })).toBe(true);
  });
});
