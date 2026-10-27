import type { Sql } from '../db';
import { UserError } from '../validation';

export type Q = Sql;

export interface EventInput {
  deliverable_id: string | null;
  sponsor_id: string;
  type: string;
  detail?: Record<string, unknown>;
}

/** History is append-only: this is the only way events are written, and nothing ever updates or deletes them. */
export async function logEvent(q: Q, e: EventInput): Promise<void> {
  await q`insert into deliverable_events (deliverable_id, sponsor_id, event_type, detail)
          values (${e.deliverable_id}, ${e.sponsor_id}, ${e.type}, ${q.json((e.detail ?? {}) as any)})`;
}

/** Translates database constraint errors into messages a person can act on. */
export function friendlyDbError(err: unknown): Error {
  const e = err as { code?: string; constraint_name?: string; message?: string };
  if (e?.code === '23505') {
    if (e.constraint_name === 'sponsors_name_unique') return new UserError('A sponsor with that name already exists.');
    if (e.constraint_name === 'packages_name_unique') return new UserError('A package with that name already exists.');
    return new UserError('That record already exists.');
  }
  if (e?.code === '23503') return new UserError('That record is still in use, so it cannot be removed.');
  if (e?.code === '23514') return new UserError('Those values are not allowed together. Check the dates and status.');
  return err instanceof Error ? err : new Error(String(err));
}

export async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export const SPONSOR_COLS = `id, name, contact_name, email, website_url, linkedin_url, package_id, status,
  start_date, end_date, date_added, notes, snoozed_until, sync_signature`;

export const DELIVERABLE_COLS = `id, sponsor_id, package_item_id, sequence_no, source, package_version, label,
  platform, status, due_date, planned_date, actual_date, published_url, notes`;
