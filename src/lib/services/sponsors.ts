import type { ISODate } from '../dates';
import type { SponsorRow } from '../domain/types';
import { UserError, type SponsorInput } from '../validation';
import { SPONSOR_COLS, logEvent, wrap, type Q } from './common';
import { applySyncTx, type SyncOptions } from './sync';

export interface SponsorListRow extends SponsorRow {
  package_name: string | null;
}

export async function listSponsors(q: Q): Promise<SponsorListRow[]> {
  return q<SponsorListRow[]>`
    select s.id, s.name, s.contact_name, s.email, s.website_url, s.linkedin_url, s.package_id, s.status,
           s.start_date, s.end_date, s.date_added, s.notes, s.snoozed_until, s.sync_signature,
           p.name as package_name
    from sponsors s left join packages p on p.id = s.package_id
    order by lower(s.name)`;
}

export async function getSponsor(q: Q, id: string): Promise<SponsorListRow | null> {
  const rows = await q<SponsorListRow[]>`
    select s.id, s.name, s.contact_name, s.email, s.website_url, s.linkedin_url, s.package_id, s.status,
           s.start_date, s.end_date, s.date_added, s.notes, s.snoozed_until, s.sync_signature,
           p.name as package_name
    from sponsors s left join packages p on p.id = s.package_id
    where s.id = ${id}`;
  return rows[0] ?? null;
}

/**
 * Adds a sponsor. If a package is chosen, its deliverables are generated in the same
 * transaction, so a sponsor never exists half-created.
 */
export async function createSponsor(
  q: Q,
  input: SponsorInput,
  opts: SyncOptions,
): Promise<SponsorRow> {
  return wrap(() =>
    q.begin(async (tx) => {
      const t = tx as unknown as Q;
      const [row] = await t<SponsorRow[]>`
        insert into sponsors (name, contact_name, email, website_url, linkedin_url, package_id, status,
                              start_date, end_date, date_added, notes)
        values (${input.name}, ${input.contact_name}, ${input.email}, ${input.website_url}, ${input.linkedin_url},
                ${input.package_id}, ${input.status}, ${input.start_date}, ${input.end_date}, ${opts.today}, ${input.notes})
        returning ${t.unsafe(SPONSOR_COLS)}`;
      await logEvent(t, { deliverable_id: null, sponsor_id: row.id, type: 'sponsor_created', detail: { name: row.name } });
      await applySyncTx(t, row.id, opts, 'full');
      return row;
    }),
  );
}

/**
 * Edits sponsor details. This never touches deliverables. If the package or dates changed,
 * the sponsor will show "Review package changes" and you decide what to apply.
 */
export async function updateSponsor(q: Q, id: string, input: SponsorInput): Promise<void> {
  await wrap(async () => {
    const res = await q`
      update sponsors set name = ${input.name}, contact_name = ${input.contact_name}, email = ${input.email},
        website_url = ${input.website_url}, linkedin_url = ${input.linkedin_url}, package_id = ${input.package_id},
        status = ${input.status}, start_date = ${input.start_date}, end_date = ${input.end_date},
        notes = ${input.notes}, updated_at = now()
      where id = ${id}`;
    if (res.count === 0) throw new UserError('That sponsor no longer exists.');
  });
}

export async function setSnoozedUntil(q: Q, id: string, until: ISODate | null): Promise<void> {
  await q`update sponsors set snoozed_until = ${until}, updated_at = now() where id = ${id}`;
}

/** Sponsors with published history are kept (set them Inactive instead) so that history is never lost. */
export async function deleteSponsor(q: Q, id: string): Promise<void> {
  const [{ n }] = await q<{ n: number }[]>`
    select count(*)::int as n from deliverables where sponsor_id = ${id} and status = 'published'`;
  if (n > 0) {
    throw new UserError(`This sponsor has ${n} published deliverable${n === 1 ? '' : 's'} on record. Set the status to Inactive instead of deleting, so the history stays.`);
  }
  await wrap(async () => {
    await q`delete from sponsors where id = ${id}`;
  });
}
