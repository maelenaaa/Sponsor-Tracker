import type { ISODate } from '../dates';
import {
  planIsEmpty,
  planSync,
  syncSignature,
  type SyncPlan,
} from '../domain/generation';
import type { DeliverableRow, PackageItem, PackageRow, SponsorRow } from '../domain/types';
import { UserError } from '../validation';
import { DELIVERABLE_COLS, SPONSOR_COLS, logEvent, wrap, type Q } from './common';

export interface SyncOptions {
  today: ISODate;
  horizonDays: number;
}

interface Context {
  sponsor: SponsorRow;
  pkg: PackageRow | null;
  items: PackageItem[];
  existing: DeliverableRow[];
}

async function loadContext(q: Q, sponsorId: string, lock: boolean): Promise<Context> {
  const [sponsor] = lock
    ? await q<SponsorRow[]>`select ${q.unsafe(SPONSOR_COLS)} from sponsors where id = ${sponsorId} for update`
    : await q<SponsorRow[]>`select ${q.unsafe(SPONSOR_COLS)} from sponsors where id = ${sponsorId}`;
  if (!sponsor) throw new UserError('That sponsor no longer exists.');
  const pkg = sponsor.package_id
    ? (await q<PackageRow[]>`select id, name, description, is_active, version from packages where id = ${sponsor.package_id}`)[0] ?? null
    : null;
  const existing = await q<DeliverableRow[]>`
    select ${q.unsafe(DELIVERABLE_COLS)} from deliverables where sponsor_id = ${sponsorId}`;
  const itemIds = existing.map((d) => d.package_item_id).filter((x): x is string => !!x);
  const items = await q<PackageItem[]>`
    select id, package_id, label, platform, recurrence, quantity, interval_months, start_offset_days,
           max_occurrences, notes, sort_order, archived
    from package_items
    where package_id = ${sponsor.package_id}
       or id = any(${itemIds}::uuid[])`;
  return { sponsor, pkg, items, existing };
}

export interface SyncPreview {
  sponsor: SponsorRow;
  pkg: PackageRow | null;
  plan: SyncPlan;
  signature: string;
  /** The package, its rules, or the sponsor's dates changed since deliverables were last generated or reviewed. */
  changed: boolean;
  /** There is something to apply. */
  hasChanges: boolean;
}

export async function previewSync(q: Q, sponsorId: string, opts: SyncOptions): Promise<SyncPreview> {
  const ctx = await loadContext(q, sponsorId, false);
  const plan = planSync({ ...ctx, ...opts });
  const signature = syncSignature(ctx.sponsor, ctx.pkg);
  return {
    sponsor: ctx.sponsor,
    pkg: ctx.pkg,
    plan,
    signature,
    changed: ctx.sponsor.sync_signature !== signature,
    hasChanges: !planIsEmpty(plan),
  };
}

export interface SyncResult {
  created: number;
  retired: number;
  dueUpdated: number;
}

/**
 * Applies the plan inside an existing transaction.
 * mode "extend" only adds missing deliverables (safe to run any time).
 * mode "full" also retires deliverables the package no longer calls for and refreshes due dates,
 * then records that the sponsor is in sync. Published history is never touched.
 */
export async function applySyncTx(
  tx: Q,
  sponsorId: string,
  opts: SyncOptions,
  mode: 'extend' | 'full',
): Promise<SyncResult> {
  const ctx = await loadContext(tx, sponsorId, true);
  const plan = planSync({ ...ctx, ...opts });
  const result: SyncResult = { created: 0, retired: 0, dueUpdated: 0 };

  for (const n of plan.toCreate) {
    // The unique index plus ON CONFLICT DO NOTHING means a double click or a refresh can never create a duplicate.
    const rows = await tx`
      insert into deliverables (sponsor_id, package_item_id, sequence_no, source, package_version, label, platform, status, due_date)
      values (${n.sponsor_id}, ${n.package_item_id}, ${n.sequence_no}, 'generated', ${n.package_version},
              ${n.label}, ${n.platform}, 'not_scheduled', ${n.due_date})
      on conflict (sponsor_id, package_item_id, sequence_no) where package_item_id is not null do nothing
      returning id`;
    if (rows.length) {
      result.created++;
      await logEvent(tx, {
        deliverable_id: rows[0].id,
        sponsor_id: sponsorId,
        type: 'generated',
        detail: { label: n.label, due_date: n.due_date, package_version: n.package_version },
      });
    }
  }

  if (mode === 'full') {
    for (const d of plan.toRetire) {
      const rows = await tx`
        update deliverables
        set status = 'not_required',
            notes = case when notes is null or notes = '' then ${`Removed from the package on ${opts.today}.`}
                         else notes || E'\n' || ${`Removed from the package on ${opts.today}.`} end,
            updated_at = now()
        where id = ${d.id} and status in ('not_scheduled', 'scheduled', 'in_progress')
        returning id`;
      if (rows.length) {
        result.retired++;
        await logEvent(tx, {
          deliverable_id: d.id,
          sponsor_id: sponsorId,
          type: 'retired',
          detail: { label: d.label, previous_status: d.status, planned_date: d.planned_date },
        });
      }
    }
    for (const { deliverable: d, newDue } of plan.toUpdateDue) {
      const rows = await tx`
        update deliverables set due_date = ${newDue}, updated_at = now()
        where id = ${d.id} and status in ('not_scheduled', 'scheduled', 'in_progress')
        returning id`;
      if (rows.length) {
        result.dueUpdated++;
        await logEvent(tx, {
          deliverable_id: d.id,
          sponsor_id: sponsorId,
          type: 'due_changed',
          detail: { from: d.due_date, to: newDue },
        });
      }
    }
    await tx`update sponsors set sync_signature = ${syncSignature(ctx.sponsor, ctx.pkg)}, updated_at = now()
             where id = ${sponsorId}`;
  }
  return result;
}

export async function applySync(q: Q, sponsorId: string, opts: SyncOptions, mode: 'extend' | 'full'): Promise<SyncResult> {
  return wrap(() => q.begin((tx) => applySyncTx(tx as unknown as Q, sponsorId, opts, mode)));
}

/**
 * Adds newly due occurrences of recurring deliverables for every sponsor that is in sync.
 * Additive only, idempotent, and safe to call on every dashboard load.
 * Sponsors whose package or dates changed are left alone until you review the changes.
 */
export async function extendAll(q: Q, opts: SyncOptions): Promise<number> {
  const sponsors = await q<SponsorRow[]>`
    select ${q.unsafe(SPONSOR_COLS)} from sponsors where status = 'active' and package_id is not null`;
  if (sponsors.length === 0) return 0;
  const ids = sponsors.map((s) => s.id);
  const packages = await q<PackageRow[]>`select id, name, description, is_active, version from packages`;
  const items = await q<PackageItem[]>`
    select id, package_id, label, platform, recurrence, quantity, interval_months, start_offset_days,
           max_occurrences, notes, sort_order, archived from package_items`;
  const deliverables = await q<DeliverableRow[]>`
    select ${q.unsafe(DELIVERABLE_COLS)} from deliverables where sponsor_id = any(${ids}::uuid[])`;

  let created = 0;
  for (const sponsor of sponsors) {
    const pkg = packages.find((p) => p.id === sponsor.package_id) ?? null;
    const existing = deliverables.filter((d) => d.sponsor_id === sponsor.id);
    const plan = planSync({ sponsor, pkg, items, existing, ...opts });
    const signature = syncSignature(sponsor, pkg);
    if (sponsor.sync_signature === signature) {
      if (plan.toCreate.length > 0) created += (await applySync(q, sponsor.id, opts, 'extend')).created;
    } else if (planIsEmpty(plan)) {
      await q`update sponsors set sync_signature = ${signature} where id = ${sponsor.id}`;
    }
  }
  return created;
}
