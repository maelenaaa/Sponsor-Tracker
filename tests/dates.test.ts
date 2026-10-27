import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, isISODate, todayInTimeZone, weekStart } from '@/lib/dates';

describe('dates', () => {
  it('adds months and clamps to the end of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
  });
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDays('2026-10-01', '2026-10-29')).toBe(28);
  });
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-10-27')).toBe('2026-10-26'); // Tuesday -> Monday
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to the week before
  });
  it('validates ISO dates strictly', () => {
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('10/27/2026')).toBe(false);
  });
  it('computes today in a time zone', () => {
    const lateNightUtc = new Date('2026-10-28T03:30:00Z');
    expect(todayInTimeZone('America/Chicago', lateNightUtc)).toBe('2026-10-27');
    expect(todayInTimeZone('UTC', lateNightUtc)).toBe('2026-10-28');
  });
});
