import type { ISODate } from '../dates';
import { effectiveDate, isOpen } from '../domain/deliverables';
import type { DeliverableRow, DeliverableStatus, Platform } from '../domain/types';
import {
  UserError,
  type DeliverableEditInput,
  type ManualDeliverableInput,
  type PublishInput,
} from '../validation';
import { DELIVERABLE_COLS, logEvent, wrap, type Q } from './common';

export interface DeliverableWithSponsor extends DeliverableRow {
  sponsor_name: string;
  sponsor_status: string;
  package_id: string | null;
  package_name: string | null;
}

export interface DeliverableFilters {
  sponsorId?: string;
  packageId?: string;
  sponsorStatus?: string;
  platform?: Platform;
  status?: DeliverableStatus;
  /** Inclusive range on the effective date (planned date, else package due date, else actual date). */
  from?: ISODate;
  to?: ISODate;
  overdueOn?: ISODate;
  /** Only deliverables that still need work. */
  outstanding?: boolean;
  search?: string;
}

const SELECT = (q: Q) => q`
  select ${q.unsafe(
    DELIVERABLE_COLS.split(',').map((c) => `d.${c.trim()}`).join(', '),
  )},
    s.name as sponsor_name, s.status as sponsor_status, s.package_id, p.name as package_name
  from deliverables d
  join sponsors s on s.id = d.sponsor_id
  left join packages p on p.id = s.package_id`;

export async function listDeliverables(q: Q, f: DeliverableFilters = {}): Promise<DeliverableWithSponsor[]> {
  const where = [q`true`];
  if (f.sponsorId) where.push(q`d.sponsor_id = ${f.sponsorId}`);
  if (f.packageId) where.push(q`s.package_id = ${f.packageId}`);
  if (f.sponsorStatus) where.push(q`s.status = ${f.sponsorStatus}`);
  if (f.platform) where.push(q`d.platform = ${f.platform}`);
  if (f.status) where.push(q`d.status = ${f.status}`);
  if (f.outstanding) where.push(q`d.status in ('not_scheduled', 'scheduled', 'in_progress')`);
  if (f.from) where.push(q`coalesce(d.actual_date, d.planned_date, d.due_date) >= ${f.from}`);
  if (f.to) where.push(q`coalesce(d.actual_date, d.planned_date, d.due_date) <= ${f.to}`);
  if (f.overdueOn) {
    where.push(
      q`d.status in ('not_scheduled', 'scheduled', 'in_progress') and coalesce(d.planned_date, d.due_date) < ${f.overdueOn}`,
    );
  }
  if (f.search) where.push(q`(s.name ilike ${'%' + f.search + '%'} or d.label ilike ${'%' + f.search + '%'})`);
  const cond = where.reduce((a, b) => q`${a} and ${b}`);
  return q<DeliverableWithSponsor[]>`${SELECT(q)} where ${cond}
    order by coalesce(d.actual_date, d.planned_date, d.due_date) nulls last, lower(s.name), d.label`;
}

export async function listAllDeliverables(q: Q): Promise<DeliverableRow[]> {
  return q<DeliverableRow[]>`select ${q.unsafe(DELIVERABLE_COLS)} from deliverables`;
}

export async function getDeliverable(q: Q, id: string): Promise<DeliverableWithSponsor | null> {
  const rows = await q<DeliverableWithSponsor[]>`${SELECT(q)} where d.id = ${id}`;
  return rows[0] ?? null;
}

export interface EventRow {
  id: number;
  deliverable_id: string | null;
  sponsor_id: string;
  event_type: string;
  detail: Record<string, unknown>;
  created_at: Date;
  label: string | null;
}

export async function listEvents(q: Q, opts: { sponsorId?: string; deliverableId?: string; limit?: number }): Promise<EventRow[]> {
  const where = [q`true`];
  if (opts.sponsorId) where.push(q`e.sponsor_id = ${opts.sponsorId}`);
  if (opts.deliverableId) where.push(q`e.deliverable_id = ${opts.deliverableId}`);
  const cond = where.reduce((a, b) => q`${a} and ${b}`);
  return q<EventRow[]>`
    select e.id, e.deliverable_id, e.sponsor_id, e.event_type, e.detail, e.created_at,
           coalesce(d.label, e.detail->>'label') as label
    from deliverable_events e left join deliverables d on d.id = e.deliverable_id
    where ${cond} order by e.created_at desc, e.id desc limit ${opts.limit ?? 200}`;
}

async function lockOne(tx: Q, id: string): Promise<DeliverableRow> {
  const [row] = await tx<DeliverableRow[]>`select ${tx.unsafe(DELIVERABLE_COLS)} from deliverables where id = ${id} for update`;
  if (!row) throw new UserError('That deliverable no longer exists.');
  return row;
}

/**
 * Sets or clears the planned date. The actual publication date is never touched.
 * A deliverable that is already published cannot be rescheduled.
 */
export async function scheduleDeliverable(q: Q, id: string, plannedDate: ISODate | null): Promise<void> {
  await wrap(() =>
    q.begin(async (tx) => {
      const t = tx as unknown as Q;
      const d = await lockOne(t, id);
      if (d.status === 'published') throw new UserError('This one is already published. Its planned date can no longer change.');
      if (d.status === 'not_required') throw new UserError('This deliverable is marked Not required. Set it back to Not scheduled first.');
      if (d.planned_date === plannedDate) return;
      let status: DeliverableStatus = d.status;
      if (plannedDate && d.status === 'not_scheduled') status = 'scheduled';
      if (!plannedDate && d.status === 'scheduled') status = 'not_scheduled';
      await t`update deliverables set planned_date = ${plannedDate}, status = ${status}, updated_at = now() where id = ${id}`;
      await logEvent(t, {
        deliverable_id: id,
        sponsor_id: d.sponsor_id,
        type: d.planned_date ? (plannedDate ? 'rescheduled' : 'unscheduled') : 'scheduled',
        detail: { label: d.label, from: d.planned_date, to: plannedDate },
      });
    }),
  );
}

/** Changes status (everything except Published, which has its own action because it needs a date). */
export async function setDeliverableStatus(q: Q, id: string, status: DeliverableStatus): Promise<void> {
  if (status === 'published') throw new UserError('Use Publish so the date and link are recorded.');
  await wrap(() =>
    q.begin(async (tx) => {
      const t = tx as unknown as Q;
      const d = await lockOne(t, id);
      if (d.status === 'published') throw new UserError('Undo the publish first if it was marked by mistake.');
      if (d.status === status) return;
      if (status === 'scheduled' && !d.planned_date) throw new UserError('Pick a planned date to schedule it.');
      const clearPlanned = status === 'not_scheduled';
      await t`update deliverables set status = ${status},
              planned_date = case when ${clearPlanned} then null else planned_date end, updated_at = now()
              where id = ${id}`;
      await logEvent(t, {
        deliverable_id: id,
        sponsor_id: d.sponsor_id,
        type: 'status_changed',
        detail: { label: d.label, from: d.status, to: status, planned_date_cleared: clearPlanned && d.planned_date ? d.planned_date : null },
      });
    }),
  );
}

/** The only way a deliverable becomes Published. Records the real date and link. The planned date is left as it was. */
export async function publishDeliverable(q: Q, id: string, input: PublishInput, today: ISODate): Promise<void> {
  if (input.actual_date > today) throw new UserError('The publication date cannot be in the future. Schedule it instead.');
  await wrap(() =>
    q.begin(async (tx) => {
      const t = tx as unknown as Q;
      const d = await lockOne(t, id);
      if (d.status === 'published') throw new UserError('This one is already published.');
      await t`update deliverables set status = 'published', actual_date = ${input.actual_date},
              published_url = ${input.published_url}, updated_at = now() where id = ${id}`;
      await logEvent(t, {
        deliverable_id: id,
        sponsor_id: d.sponsor_id,
        type: 'published',
        detail: {
          label: d.label,
          platform: d.platform,
          actual_date: input.actual_date,
          published_url: input.published_url,
          planned_date: d.planned_date,
          previous_status: d.status,
        },
      });
    }),
  );
}

/** Fixes the date or link of something already published. Logged, so the original values stay in history. */
export async function correctPublished(q: Q, id: string, input: PublishInput, today: ISODate): Promise<void> {
  if (input.actual_date > today) throw new UserError('The publication date cannot be in the future.');
  await wrap(() =>
    q.begin(async (tx) => {
      const t = tx as unknown as Q;
      const d = await lockOne(t, id);
      if (d.status !== 'published') throw new UserError('This deliverable is not published yet.');
      await t`update deliverables set actual_date = ${input.actual_date}, published_url = ${input.published_url}, updated_at = now() where id = ${id}`;
      await logEvent(t, {
        deliverable_id: id,
        sponsor_id: d.sponsor_id,
        type: 'publish_corrected',
        detail: {
          label: d.label,
          from: { actual_date: d.actual_date, published_url: d.published_url },
          to: { actual_date: input.actual_date, published_url: input.published_url },
        },
      });
    }),
  );
}

/** Undo a publish that was marked by mistake. The old date and link are kept in history. */
export async function unpublishDeliverable(q: Q, id: string): Promise<void> {
  await wrap(() =>
    q.begin(async (tx) => {
      const t = tx as unknown as Q;
      const d = await lockOne(t, id);
      if (d.status !== 'published') throw new UserError('This deliverable is not published.');
      const status: DeliverableStatus = d.planned_date ? 'scheduled' : 'not_scheduled';
      await t`update deliverables set status = ${status}, actual_date = null, published_url = null, updated_at = now() where id = ${id}`;
      await logEvent(t, {
        deliverable_id: id,
        sponsor_id: d.sponsor_id,
        type: 'unpublished',
        detail: { label: d.label, was: { actual_date: d.actual_date, published_url: d.published_url }, now: status },
      });
    }),
  );
}

export async function editDeliverableNotes(q: Q, id: string, input: Pick<DeliverableEditInput, 'notes'>): Promise<void> {
  await wrap(async () => {
    const res = await q`update deliverables set notes = ${input.notes}, updated_at = now() where id = ${id}`;
    if (res.count === 0) throw new UserError('That deliverable no longer exists.');
  });
}

export async function createManualDeliverable(q: Q, input: ManualDeliverableInput): Promise<DeliverableRow> {
  return wrap(() =>
    q.begin(async (tx) => {
      const t = tx as unknown as Q;
      const status: DeliverableStatus = input.planned_date ? 'scheduled' : 'not_scheduled';
      const [row] = await t<DeliverableRow[]>`
        insert into deliverables (sponsor_id, source, label, platform, status, planned_date, notes)
        values (${input.sponsor_id}, 'manual', ${input.label}, ${input.platform}, ${status}, ${input.planned_date}, ${input.notes})
        returning ${t.unsafe(DELIVERABLE_COLS)}`;
      await logEvent(t, { deliverable_id: row.id, sponsor_id: row.sponsor_id, type: 'created', detail: { label: row.label, platform: row.platform } });
      return row;
    }),
  );
}

/** Only hand-added deliverables that were never published can be deleted. Package-generated ones are marked Not required instead. */
export async function deleteManualDeliverable(q: Q, id: string): Promise<void> {
  await wrap(() =>
    q.begin(async (tx) => {
      const t = tx as unknown as Q;
      const d = await lockOne(t, id);
      if (d.source !== 'manual') throw new UserError('This deliverable comes from the package. Mark it Not required instead of deleting it.');
      if (d.status === 'published') throw new UserError('Published deliverables stay on record. Undo the publish first if it was a mistake.');
      await t`delete from deliverables where id = ${id}`;
      await logEvent(t, { deliverable_id: id, sponsor_id: d.sponsor_id, type: 'deleted', detail: { label: d.label } });
    }),
  );
}

export { effectiveDate, isOpen };
