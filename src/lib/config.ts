import { todayInTimeZone, type ISODate } from './dates';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const config = {
  get timeZone(): string {
    return process.env.APP_TIMEZONE || 'America/Chicago';
  },
  /** How far ahead recurring deliverables are created. */
  get generationHorizonDays(): number {
    return intFromEnv('GENERATION_HORIZON_DAYS', 90);
  },
  /** How far ahead a deliverable can be due and still be recommended now. */
  get recommendLookaheadDays(): number {
    return intFromEnv('RECOMMEND_LOOKAHEAD_DAYS', 30);
  },
  today(): ISODate {
    return todayInTimeZone(this.timeZone);
  },
};
