import { diffDays, type ISODate } from '../dates';
import { OPEN_STATUSES, type DeliverableRow, type DeliverableStatus } from './types';

type DateFields = Pick<DeliverableRow, 'status' | 'planned_date' | 'due_date'>;

export function isOpen(status: DeliverableStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** The date that matters for scheduling: your planned date if you set one, otherwise the date the package says it is due. */
export function effectiveDate(d: Pick<DeliverableRow, 'planned_date' | 'due_date'>): ISODate | null {
  return d.planned_date ?? d.due_date ?? null;
}

/**
 * Overdue = still open AND its effective date is before today.
 * Published and not-required deliverables are never overdue.
 */
export function isOverdue(d: DateFields, today: ISODate): boolean {
  if (!isOpen(d.status)) return false;
  const date = effectiveDate(d);
  return date !== null && date < today;
}

export function daysOverdue(d: DateFields, today: ISODate): number {
  const date = effectiveDate(d);
  if (!date || !isOverdue(d, today)) return 0;
  return diffDays(date, today);
}

/** Counts that exclude waived (not required) deliverables. */
export function progress(deliverables: Pick<DeliverableRow, 'status'>[]) {
  const required = deliverables.filter((d) => d.status !== 'not_required');
  const completed = required.filter((d) => d.status === 'published').length;
  return { required: required.length, completed, remaining: required.length - completed };
}
