import { addDays, addMonths, type ISODate } from '../dates';
import { isOpen } from './deliverables';
import type { DeliverableRow, PackageItem, PackageRow, SponsorRow } from './types';

/**
 * Turns a package template into concrete deliverables for one sponsor.
 * Everything here is a pure function: no database, no clock. The services call
 * it and apply the result inside a transaction.
 */

export interface NewDeliverable {
  sponsor_id: string;
  package_item_id: string;
  sequence_no: number;
  package_version: number;
  label: string;
  platform: PackageItem['platform'];
  due_date: ISODate;
}

export interface SyncPlan {
  /** Deliverables the package calls for that do not exist yet. */
  toCreate: NewDeliverable[];
  /** Unpublished generated deliverables the package no longer calls for. They are marked Not required, never deleted. */
  toRetire: DeliverableRow[];
  /** Unpublished generated deliverables whose package due date has moved. Planned dates are never touched. */
  toUpdateDue: { deliverable: DeliverableRow; newDue: ISODate }[];
}

export interface SyncInput {
  sponsor: SponsorRow;
  pkg: PackageRow | null;
  /** Every item that might be referenced (current package items plus any referenced by existing deliverables). */
  items: PackageItem[];
  existing: DeliverableRow[];
  today: ISODate;
  horizonDays: number;
}

const MAX_RECURRING = 500; // safety net, never reached with real rules

export function baseDate(sponsor: Pick<SponsorRow, 'start_date' | 'date_added'>): ISODate {
  return sponsor.start_date ?? sponsor.date_added;
}

/** Due date of occurrence number `seq` (1-based) of an item for a sponsor. */
export function occurrenceDue(
  item: Pick<PackageItem, 'start_offset_days' | 'interval_months'>,
  sponsor: Pick<SponsorRow, 'start_date' | 'date_added'>,
  seq: number,
): ISODate {
  const first = addDays(baseDate(sponsor), item.start_offset_days);
  const step = item.interval_months ?? 0;
  return step > 0 ? addMonths(first, (seq - 1) * step) : first;
}

export function occurrenceLimit(item: Pick<PackageItem, 'recurrence' | 'quantity' | 'max_occurrences'>): number {
  return item.recurrence === 'one_time' ? item.quantity : item.max_occurrences ?? Infinity;
}

/** Is occurrence `seq` still part of the commitment (inside the count limit and before the sponsorship ends)? */
export function isAllowedOccurrence(item: PackageItem, sponsor: SponsorRow, seq: number): boolean {
  if (seq > occurrenceLimit(item)) return false;
  if (sponsor.end_date && occurrenceDue(item, sponsor, seq) > sponsor.end_date) return false;
  return true;
}

/**
 * The occurrences that should exist right now.
 * One-time items create every occurrence immediately.
 * Recurring items create the first occurrence plus any due within the rolling horizon.
 */
export function desiredOccurrences(
  item: PackageItem,
  sponsor: SponsorRow,
  today: ISODate,
  horizonDays: number,
): { seq: number; due: ISODate }[] {
  const out: { seq: number; due: ISODate }[] = [];
  const horizon = addDays(today, horizonDays);
  const cap = item.recurrence === 'one_time' ? item.quantity : MAX_RECURRING;
  for (let seq = 1; seq <= cap; seq++) {
    if (!isAllowedOccurrence(item, sponsor, seq)) break;
    const due = occurrenceDue(item, sponsor, seq);
    if (item.recurrence === 'recurring' && seq > 1 && due > horizon) break;
    out.push({ seq, due });
  }
  return out;
}

export function deliverableLabel(item: PackageItem, seq: number): string {
  const numbered = item.recurrence === 'recurring' || item.quantity > 1;
  return numbered ? `${item.label} #${seq}` : item.label;
}

export function syncSignature(
  sponsor: Pick<SponsorRow, 'start_date' | 'end_date'>,
  pkg: Pick<PackageRow, 'id' | 'version'> | null,
): string {
  return [pkg?.id ?? 'none', pkg?.version ?? 0, sponsor.start_date ?? '', sponsor.end_date ?? ''].join('|');
}

const keyOf = (itemId: string, seq: number) => `${itemId}:${seq}`;

export function planSync(input: SyncInput): SyncPlan {
  const { sponsor, pkg, items, existing, today, horizonDays } = input;
  const plan: SyncPlan = { toCreate: [], toRetire: [], toUpdateDue: [] };

  const activeItems = pkg ? items.filter((i) => i.package_id === pkg.id && !i.archived) : [];
  const activeById = new Map(activeItems.map((i) => [i.id, i]));
  const existingKeys = new Set(
    existing.filter((d) => d.package_item_id).map((d) => keyOf(d.package_item_id!, d.sequence_no)),
  );

  if (pkg && sponsor.status === 'active') {
    for (const item of activeItems) {
      for (const { seq, due } of desiredOccurrences(item, sponsor, today, horizonDays)) {
        if (existingKeys.has(keyOf(item.id, seq))) continue;
        plan.toCreate.push({
          sponsor_id: sponsor.id,
          package_item_id: item.id,
          sequence_no: seq,
          package_version: pkg.version,
          label: deliverableLabel(item, seq),
          platform: item.platform,
          due_date: due,
        });
      }
    }
  }

  for (const d of existing) {
    if (d.source !== 'generated' || !d.package_item_id || !isOpen(d.status)) continue;
    const item = activeById.get(d.package_item_id);
    if (!item || !isAllowedOccurrence(item, sponsor, d.sequence_no)) {
      plan.toRetire.push(d);
      continue;
    }
    const due = occurrenceDue(item, sponsor, d.sequence_no);
    if (due !== d.due_date) plan.toUpdateDue.push({ deliverable: d, newDue: due });
  }

  return plan;
}

export function planIsEmpty(plan: SyncPlan): boolean {
  return plan.toCreate.length === 0 && plan.toRetire.length === 0 && plan.toUpdateDue.length === 0;
}
