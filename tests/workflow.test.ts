import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/db';
import { recommend } from '@/lib/domain/recommend';
import { summarize } from '@/lib/domain/stats';
import { seedSamplePackages } from '@/lib/samples';
import {
  correctPublished, createManualDeliverable, deleteManualDeliverable, getDeliverable, listDeliverables,
  listEvents, publishDeliverable, scheduleDeliverable, setDeliverableStatus, unpublishDeliverable,
} from '@/lib/services/deliverables';
import { addItem, getPackage, setItemArchived, updateItem } from '@/lib/services/packages';
import { createSponsor, deleteSponsor, getSponsor, updateSponsor } from '@/lib/services/sponsors';
import { applySync, extendAll, previewSync } from '@/lib/services/sync';
import { UserError, packageItemInput, sponsorInput } from '@/lib/validation';
import { resetDb, setupDb } from './db';

let sql: Sql;
const TODAY = '2026-10-27';
const opts = { today: TODAY, horizonDays: 90 };

beforeAll(async () => {
  sql = await setupDb();
});
afterAll(async () => {
  await sql.end();
});
beforeEach(async () => {
  await resetDb(sql);
});

const newSponsor = (over: Record<string, unknown>) => sponsorInput.parse({ status: 'active', ...over });

describe('the acceptance scenario', () => {
  it('walks from a new Premier sponsor to published history, independently per platform', async () => {
    const { premier } = await seedSamplePackages(sql);

    // 1-3. Add a sponsor on the Premier package: deliverables appear.
    const sponsor = await createSponsor(sql, newSponsor({ name: 'Acme Benefits', package_id: premier.id, start_date: '2026-10-26' }), opts);
    let list = await listDeliverables(sql, { sponsorId: sponsor.id });
    const website = list.find((d) => d.platform === 'website')!;
    const firstLinkedIn = list.find((d) => d.label === 'First feature on LinkedIn')!;
    expect(website).toBeDefined();
    expect(firstLinkedIn).toBeDefined();
    expect(list.filter((d) => d.label.startsWith('LinkedIn feature')).length).toBeGreaterThan(0);
    expect(list.every((d) => d.status === 'not_scheduled')).toBe(true);

    // 4. Schedule the website feature.
    await scheduleDeliverable(sql, website.id, '2026-11-05');
    let w = (await getDeliverable(sql, website.id))!;
    expect(w.status).toBe('scheduled');
    expect(w.planned_date).toBe('2026-11-05');
    expect(w.actual_date).toBeNull();
    // A scheduled post is not published: history has no website publication yet.
    list = await listDeliverables(sql, { sponsorId: sponsor.id });
    expect(summarize(list, TODAY).website.lastPublished).toBeNull();

    // 5-6. Publish it with a URL: website history and outstanding counts update.
    const before = summarize(list, TODAY);
    await publishDeliverable(sql, website.id, { actual_date: TODAY, published_url: 'https://example.org/sponsors/acme' }, TODAY);
    w = (await getDeliverable(sql, website.id))!;
    expect(w.status).toBe('published');
    expect(w.actual_date).toBe(TODAY);
    expect(w.planned_date).toBe('2026-11-05'); // planned date untouched
    expect(w.published_url).toBe('https://example.org/sponsors/acme');
    list = await listDeliverables(sql, { sponsorId: sponsor.id });
    const after = summarize(list, TODAY);
    expect(after.website.completed).toBe(1);
    expect(after.website.lastPublished).toBe(TODAY);
    expect(after.remaining).toBe(before.remaining - 1);

    // 7-8. LinkedIn is untouched by the website publish, then updates on its own.
    expect(after.linkedin.completed).toBe(0);
    expect(after.linkedin.lastPublished).toBeNull();
    await publishDeliverable(sql, firstLinkedIn.id, { actual_date: TODAY, published_url: 'https://www.linkedin.com/posts/acme-123' }, TODAY);
    list = await listDeliverables(sql, { sponsorId: sponsor.id });
    const afterLi = summarize(list, TODAY);
    expect(afterLi.linkedin.completed).toBe(1);
    expect(afterLi.linkedin.lastPublished).toBe(TODAY);

    // 9. The recommendation moves on to a sponsor that still needs a website feature.
    const other = await createSponsor(sql, newSponsor({ name: 'Bayside Law', package_id: premier.id, start_date: '2026-10-01' }), opts);
    const sponsors = await sql<any[]>`select * from sponsors`;
    const all = await sql<any[]>`select * from deliverables`;
    const rec = recommend('website', sponsors, all, { today: TODAY, lookaheadDays: 30 });
    expect(rec.ranked.map((c) => c.sponsor.id)).toEqual([other.id]);

    // 10. Come back later: the full story is there.
    const events = await listEvents(sql, { deliverableId: website.id });
    expect(events.map((e) => e.event_type).reverse()).toEqual(['generated', 'scheduled', 'published']);
    const found = await listDeliverables(sql, { search: 'acme' });
    expect(found.length).toBe(list.length);
  });

  it('keeps the planned date and actual date separate when a post goes out on a different day', async () => {
    const { premier } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Slip Co', package_id: premier.id, start_date: '2026-10-01' }), opts);
    const d = (await listDeliverables(sql, { sponsorId: s.id, platform: 'website' }))[0];
    await scheduleDeliverable(sql, d.id, '2026-10-20');
    await scheduleDeliverable(sql, d.id, '2026-10-25'); // rescheduled
    await publishDeliverable(sql, d.id, { actual_date: '2026-10-26', published_url: null }, TODAY);
    const after = (await getDeliverable(sql, d.id))!;
    expect(after.planned_date).toBe('2026-10-25');
    expect(after.actual_date).toBe('2026-10-26');
    await expect(scheduleDeliverable(sql, d.id, '2026-12-01')).rejects.toBeInstanceOf(UserError);
    const ev = (await listEvents(sql, { deliverableId: d.id })).map((e) => e.event_type).reverse();
    expect(ev).toEqual(['generated', 'scheduled', 'rescheduled', 'published']);
  });

  it('rejects publishing in the future and can undo a mistaken publish while keeping history', async () => {
    const { monthly } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Oops Inc', package_id: monthly.id, start_date: '2026-10-01' }), opts);
    const d = (await listDeliverables(sql, { sponsorId: s.id, platform: 'website' }))[0];
    await expect(publishDeliverable(sql, d.id, { actual_date: '2026-12-01', published_url: null }, TODAY)).rejects.toBeInstanceOf(UserError);
    await publishDeliverable(sql, d.id, { actual_date: '2026-10-20', published_url: 'https://example.org/x' }, TODAY);
    await correctPublished(sql, d.id, { actual_date: '2026-10-21', published_url: 'https://example.org/y' }, TODAY);
    await unpublishDeliverable(sql, d.id);
    const row = (await getDeliverable(sql, d.id))!;
    expect(row.status).toBe('not_scheduled');
    expect(row.actual_date).toBeNull();
    const events = await listEvents(sql, { deliverableId: d.id });
    const undo = events.find((e) => e.event_type === 'unpublished')!;
    expect((undo.detail as any).was.published_url).toBe('https://example.org/y');
  });
});

describe('no duplicate deliverables', () => {
  it('creates each package deliverable exactly once, however often sync runs', async () => {
    const { monthly } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Monthly Co', package_id: monthly.id, start_date: '2026-07-01' }), opts);
    const count = async () => (await sql<{ n: number }[]>`select count(*)::int n from deliverables where sponsor_id = ${s.id}`)[0].n;
    const first = await count();
    // website x1 plus a LinkedIn post for Jul 1, Aug 1, Sep 1, Oct 1, Nov 1, Dec 1, Jan 1 (horizon is Jan 25)
    expect(first).toBe(1 + 7);

    await extendAll(sql, opts);
    await extendAll(sql, opts);
    await applySync(sql, s.id, opts, 'full');
    await Promise.all([1, 2, 3, 4, 5].map(() => applySync(sql, s.id, opts, 'extend')));
    await Promise.all([1, 2, 3].map(() => extendAll(sql, opts)));
    expect(await count()).toBe(first);

    const dupes = await sql`select sponsor_id, package_item_id, sequence_no, count(*) from deliverables
      where package_item_id is not null group by 1, 2, 3 having count(*) > 1`;
    expect(dupes).toHaveLength(0);
  });

  it('adds only the newly due occurrences as time passes', async () => {
    const { monthly } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Rolling Co', package_id: monthly.id, start_date: '2026-10-01' }), opts);
    const base = (await sql<{ n: number }[]>`select count(*)::int n from deliverables where sponsor_id = ${s.id}`)[0].n;
    const later = { today: '2026-12-27', horizonDays: 90 };
    const created = await extendAll(sql, later);
    expect(created).toBe(2); // Feb 1 and Mar 1 now fall inside the horizon (Mar 27)
    expect(await extendAll(sql, later)).toBe(0);
    const total = (await sql<{ n: number }[]>`select count(*)::int n from deliverables where sponsor_id = ${s.id}`)[0].n;
    expect(total).toBe(base + 2);
  });

  it('is enforced by the database itself', async () => {
    const { premier } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Guarded', package_id: premier.id, start_date: '2026-10-01' }), opts);
    const [d] = await sql<any[]>`select * from deliverables where sponsor_id = ${s.id} and package_item_id is not null limit 1`;
    await expect(
      sql`insert into deliverables (sponsor_id, package_item_id, sequence_no, label, platform)
          values (${d.sponsor_id}, ${d.package_item_id}, ${d.sequence_no}, 'dupe', ${d.platform})`,
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('does not regenerate a deliverable that was marked Not required', async () => {
    const { premier } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Waived', package_id: premier.id, start_date: '2026-10-01' }), opts);
    const d = (await listDeliverables(sql, { sponsorId: s.id, platform: 'website' }))[0];
    await setDeliverableStatus(sql, d.id, 'not_required');
    await extendAll(sql, opts);
    await applySync(sql, s.id, opts, 'full');
    const rows = await listDeliverables(sql, { sponsorId: s.id, platform: 'website' });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('not_required');
  });
});

describe('changing a package', () => {
  it('flags the change for review, then adds and retires without touching published history', async () => {
    const { premier } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Change Co', package_id: premier.id, start_date: '2026-10-01' }), opts);
    const web = (await listDeliverables(sql, { sponsorId: s.id, platform: 'website' }))[0];
    await publishDeliverable(sql, web.id, { actual_date: '2026-10-15', published_url: 'https://example.org/a' }, TODAY);

    expect((await previewSync(sql, s.id, opts)).changed).toBe(false);

    // Edit the package: require two website features, and drop the first-on-LinkedIn rule.
    const pkg = (await getPackage(sql, premier.id))!;
    const webRule = pkg.items.find((i) => i.platform === 'website')!;
    const liRule = pkg.items.find((i) => i.label === 'First feature on LinkedIn')!;
    await updateItem(sql, webRule.id, packageItemInput.parse({ ...webRule, quantity: 2 }));
    await setItemArchived(sql, liRule.id, true);

    // Nothing changed silently.
    const rowsBefore = await listDeliverables(sql, { sponsorId: s.id });
    expect(rowsBefore.find((d) => d.label === 'First feature on LinkedIn')!.status).toBe('not_scheduled');

    const preview = await previewSync(sql, s.id, opts);
    expect(preview.changed).toBe(true);
    expect(preview.plan.toCreate.map((c) => c.label)).toContain('Website feature #2');
    expect(preview.plan.toRetire.map((d) => d.label)).toEqual(['First feature on LinkedIn']);
    expect(preview.plan.toRetire.every((d) => d.status !== 'published')).toBe(true);

    await applySync(sql, s.id, opts, 'full');
    const rows = await listDeliverables(sql, { sponsorId: s.id });
    const published = rows.find((d) => d.id === web.id)!;
    expect(published.status).toBe('published');
    expect(published.actual_date).toBe('2026-10-15');
    expect(rows.find((d) => d.label === 'First feature on LinkedIn')!.status).toBe('not_required');
    expect(rows.find((d) => d.label === 'Website feature #2')).toBeDefined();
    expect((await previewSync(sql, s.id, opts)).changed).toBe(false);
    // Second apply is a no-op.
    const again = await applySync(sql, s.id, opts, 'full');
    expect(again).toEqual({ created: 0, retired: 0, dueUpdated: 0 });
  });

  it('moving a sponsor to a different package retires the old open work and keeps what was published', async () => {
    const { premier, monthly } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Switcher', package_id: premier.id, start_date: '2026-10-01' }), opts);
    const li = (await listDeliverables(sql, { sponsorId: s.id })).find((d) => d.label === 'First feature on LinkedIn')!;
    await publishDeliverable(sql, li.id, { actual_date: '2026-10-10', published_url: 'https://www.linkedin.com/posts/x' }, TODAY);

    const row = (await getSponsor(sql, s.id))!;
    await updateSponsor(sql, s.id, newSponsor({ ...row, package_id: monthly.id }));
    expect((await previewSync(sql, s.id, opts)).changed).toBe(true);
    // Extending automatically must not apply a half-reviewed change.
    expect(await extendAll(sql, opts)).toBe(0);

    await applySync(sql, s.id, opts, 'full');
    const rows = await listDeliverables(sql, { sponsorId: s.id });
    expect(rows.find((d) => d.id === li.id)!.status).toBe('published');
    expect(rows.filter((d) => d.status === 'not_required').length).toBeGreaterThan(0);
    expect(rows.some((d) => d.label === 'Monthly LinkedIn post #1')).toBe(true);
  });

  it('editing only notes or contact details never touches deliverables', async () => {
    const { premier } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Notes Co', package_id: premier.id, start_date: '2026-10-01' }), opts);
    const before = await sql`select id, status, due_date from deliverables where sponsor_id = ${s.id} order by id`;
    const row = (await getSponsor(sql, s.id))!;
    await updateSponsor(sql, s.id, newSponsor({ ...row, notes: 'Called on Monday', contact_name: 'Pat' }));
    expect((await previewSync(sql, s.id, opts)).changed).toBe(false);
    const after = await sql`select id, status, due_date from deliverables where sponsor_id = ${s.id} order by id`;
    expect(after).toEqual(before);
  });
});

describe('safeguards and validation', () => {
  it('only needs a name to add a sponsor, and rejects bad emails, links and dates', () => {
    expect(sponsorInput.safeParse({ name: 'Quick add' }).success).toBe(true);
    expect(sponsorInput.safeParse({ name: '' }).success).toBe(false);
    expect(sponsorInput.safeParse({ name: 'x', email: 'nope' }).success).toBe(false);
    expect(sponsorInput.safeParse({ name: 'x', website_url: 'not a url' }).success).toBe(false);
    expect(sponsorInput.safeParse({ name: 'x', start_date: '2026-12-01', end_date: '2026-11-01' }).success).toBe(false);
    const ok = sponsorInput.parse({ name: 'x', website_url: 'example.com', email: '' });
    expect(ok.website_url).toBe('https://example.com');
    expect(ok.email).toBeNull();
  });

  it('rejects a duplicate sponsor name with a plain message', async () => {
    await createSponsor(sql, newSponsor({ name: 'Same Name' }), opts);
    await expect(createSponsor(sql, newSponsor({ name: ' same name ' }), opts)).rejects.toThrow('already exists');
  });

  it('keeps sponsors with published history, but deletes ones with none', async () => {
    const { monthly } = await seedSamplePackages(sql);
    const keep = await createSponsor(sql, newSponsor({ name: 'Keeper', package_id: monthly.id, start_date: '2026-10-01' }), opts);
    const gone = await createSponsor(sql, newSponsor({ name: 'Goner', package_id: monthly.id, start_date: '2026-10-01' }), opts);
    const d = (await listDeliverables(sql, { sponsorId: keep.id, platform: 'website' }))[0];
    await publishDeliverable(sql, d.id, { actual_date: TODAY, published_url: null }, TODAY);
    await expect(deleteSponsor(sql, keep.id)).rejects.toBeInstanceOf(UserError);
    await deleteSponsor(sql, gone.id);
    expect(await getSponsor(sql, gone.id)).toBeNull();
  });

  it('lets hand-added deliverables be deleted but protects package ones', async () => {
    const { monthly } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Manual Co', package_id: monthly.id, start_date: '2026-10-01' }), opts);
    const manual = await createManualDeliverable(sql, { sponsor_id: s.id, label: 'Event shout-out', platform: 'other', planned_date: '2026-11-12', notes: null });
    expect(manual.status).toBe('scheduled');
    const generated = (await listDeliverables(sql, { sponsorId: s.id, platform: 'website' }))[0];
    await expect(deleteManualDeliverable(sql, generated.id)).rejects.toBeInstanceOf(UserError);
    await deleteManualDeliverable(sql, manual.id);
    expect(await getDeliverable(sql, manual.id)).toBeNull();
  });

  it('refuses to schedule without a date and blocks invalid package rules', async () => {
    const { monthly } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Rules Co', package_id: monthly.id, start_date: '2026-10-01' }), opts);
    const d = (await listDeliverables(sql, { sponsorId: s.id, platform: 'website' }))[0];
    await expect(setDeliverableStatus(sql, d.id, 'scheduled')).rejects.toBeInstanceOf(UserError);
    expect(packageItemInput.safeParse({ label: 'x', platform: 'linkedin', recurrence: 'recurring' }).success).toBe(false);
    await expect(
      addItem(sql, monthly.id, packageItemInput.parse({ label: 'x', platform: 'other', recurrence: 'one_time', quantity: 2 })),
    ).resolves.toBeDefined();
  });

  it('filters deliverables by platform, status, date range and overdue', async () => {
    const { premier } = await seedSamplePackages(sql);
    const s = await createSponsor(sql, newSponsor({ name: 'Filter Co', package_id: premier.id, start_date: '2026-09-01' }), opts);
    const web = (await listDeliverables(sql, { sponsorId: s.id, platform: 'website' }))[0];
    await scheduleDeliverable(sql, web.id, '2026-11-10');
    expect((await listDeliverables(sql, { platform: 'website' })).length).toBe(1);
    expect((await listDeliverables(sql, { status: 'scheduled' })).length).toBe(1);
    expect((await listDeliverables(sql, { from: '2026-11-01', to: '2026-11-30' })).map((d) => d.id)).toContain(web.id);
    const overdue = await listDeliverables(sql, { overdueOn: TODAY });
    expect(overdue.every((d) => d.id !== web.id)).toBe(true);
    expect(overdue.length).toBeGreaterThan(0);
  });
});
