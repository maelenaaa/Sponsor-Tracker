import { describe, expect, it } from 'vitest';
import { desiredOccurrences, planIsEmpty, planSync, syncSignature } from '@/lib/domain/generation';
import { isOverdue, progress } from '@/lib/domain/deliverables';
import { deliverable, item, pkg, sponsor } from './fixtures';

const TODAY = '2026-10-27';
const opts = { today: TODAY, horizonDays: 90 };

describe('desiredOccurrences', () => {
  it('creates every one-time occurrence at once', () => {
    const p = pkg();
    const it1 = item(p.id, { quantity: 3, interval_months: 1 });
    const s = sponsor({ start_date: '2026-11-01' });
    const out = desiredOccurrences(it1, s, TODAY, 90);
    expect(out.map((o) => o.due)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
  });

  it('creates recurring occurrences only up to the rolling horizon', () => {
    const p = pkg();
    const rec = item(p.id, { recurrence: 'recurring', interval_months: 1, label: 'LinkedIn post' });
    const s = sponsor({ start_date: '2026-10-01' });
    const out = desiredOccurrences(rec, s, TODAY, 90);
    // Oct 1, Nov 1, Dec 1, Jan 1 (Jan 25 is the horizon), Feb 1 is beyond
    expect(out.map((o) => o.due)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01']);
  });

  it('stops at the sponsorship end date and at max occurrences', () => {
    const p = pkg();
    const rec = item(p.id, { recurrence: 'recurring', interval_months: 2, start_offset_days: 60 });
    const s = sponsor({ start_date: '2026-01-01', end_date: '2026-12-31' });
    const dues = desiredOccurrences(rec, s, '2026-01-01', 3650).map((o) => o.due);
    expect(dues[0]).toBe('2026-03-02');
    expect(dues.every((d) => d <= '2026-12-31')).toBe(true);
    const capped = item(p.id, { recurrence: 'recurring', interval_months: 1, max_occurrences: 2 });
    expect(desiredOccurrences(capped, sponsor({ start_date: '2026-01-01' }), '2026-01-01', 3650)).toHaveLength(2);
  });
});

describe('planSync', () => {
  const p = pkg({ version: 3 });
  const items = [
    item(p.id, { label: 'Website feature' }),
    item(p.id, { label: 'LinkedIn post', platform: 'linkedin', recurrence: 'recurring', interval_months: 2, start_offset_days: 30 }),
  ];
  const s = sponsor({ package_id: p.id, start_date: '2026-10-01' });

  it('creates what is missing and nothing else', () => {
    const plan = planSync({ sponsor: s, pkg: p, items, existing: [], ...opts });
    // LinkedIn #1 is due Oct 31, #2 Dec 31, #3 Feb 28, which is past the 90 day horizon (Jan 25).
    expect(plan.toCreate.map((c) => c.label)).toEqual(['Website feature', 'LinkedIn post #1', 'LinkedIn post #2']);
    expect(plan.toCreate.every((c) => c.package_version === 3)).toBe(true);
  });

  it('is idempotent: running it again after creation plans nothing', () => {
    const first = planSync({ sponsor: s, pkg: p, items, existing: [], ...opts });
    const existing = first.toCreate.map((c) =>
      deliverable(s.id, { ...c, source: 'generated', status: 'not_scheduled' }),
    );
    expect(planIsEmpty(planSync({ sponsor: s, pkg: p, items, existing, ...opts }))).toBe(true);
  });

  it('does not recreate a deliverable that was published or waived', () => {
    const existing = [
      deliverable(s.id, { package_item_id: items[0].id, sequence_no: 1, source: 'generated', status: 'published', actual_date: '2026-10-10', due_date: '2026-10-01' }),
      deliverable(s.id, { package_item_id: items[1].id, sequence_no: 1, source: 'generated', status: 'not_required', due_date: '2026-10-31' }),
    ];
    const plan = planSync({ sponsor: s, pkg: p, items, existing, ...opts });
    expect(plan.toCreate.map((c) => c.label)).not.toContain('Website feature');
    expect(plan.toCreate.map((c) => c.label)).not.toContain('LinkedIn post #1');
  });

  it('retires unpublished deliverables when the package drops them, but never published ones', () => {
    const archived = items.map((i, idx) => (idx === 0 ? { ...i, archived: true } : i));
    const existing = [
      deliverable(s.id, { package_item_id: items[0].id, source: 'generated', status: 'scheduled', planned_date: '2026-11-05', due_date: '2026-10-01' }),
      deliverable(s.id, { package_item_id: items[1].id, sequence_no: 1, source: 'generated', status: 'published', actual_date: '2026-11-02', due_date: '2026-10-31' }),
    ];
    const plan = planSync({ sponsor: s, pkg: p, items: archived, existing, ...opts });
    expect(plan.toRetire).toHaveLength(1);
    expect(plan.toRetire[0].package_item_id).toBe(items[0].id);
  });

  it('retires extra occurrences when a quantity is reduced', () => {
    const three = item(p.id, { quantity: 3, interval_months: 1 });
    const existing = [1, 2, 3].map((n) =>
      deliverable(s.id, { package_item_id: three.id, sequence_no: n, source: 'generated', due_date: ['2026-10-01', '2026-11-01', '2026-12-01'][n - 1] }),
    );
    const reduced = { ...three, quantity: 2 };
    const plan = planSync({ sponsor: s, pkg: p, items: [reduced], existing, ...opts });
    expect(plan.toRetire.map((d) => d.sequence_no)).toEqual([3]);
  });

  it('moves due dates but leaves planned dates alone', () => {
    const existing = [
      deliverable(s.id, { package_item_id: items[0].id, source: 'generated', status: 'scheduled', planned_date: '2026-11-20', due_date: '2026-09-01' }),
    ];
    const plan = planSync({ sponsor: s, pkg: p, items: [items[0]], existing, ...opts });
    expect(plan.toUpdateDue).toHaveLength(1);
    expect(plan.toUpdateDue[0].newDue).toBe('2026-10-01');
    expect(plan.toRetire).toHaveLength(0);
  });

  it('creates nothing for sponsors that are not active', () => {
    const plan = planSync({ sponsor: { ...s, status: 'paused' }, pkg: p, items, existing: [], ...opts });
    expect(plan.toCreate).toHaveLength(0);
  });

  it('changes the signature when the package version or dates change', () => {
    expect(syncSignature(s, p)).not.toBe(syncSignature(s, { ...p, version: 4 }));
    expect(syncSignature(s, p)).not.toBe(syncSignature({ ...s, end_date: '2027-01-01' }, p));
  });
});

describe('overdue and progress', () => {
  it('is overdue only when open and past the planned date (or due date when unscheduled)', () => {
    expect(isOverdue({ status: 'scheduled', planned_date: '2026-10-20', due_date: '2026-10-01' }, TODAY)).toBe(true);
    expect(isOverdue({ status: 'scheduled', planned_date: '2026-11-20', due_date: '2026-10-01' }, TODAY)).toBe(false);
    expect(isOverdue({ status: 'not_scheduled', planned_date: null, due_date: '2026-10-01' }, TODAY)).toBe(true);
    expect(isOverdue({ status: 'published', planned_date: '2026-10-01', due_date: '2026-10-01' }, TODAY)).toBe(false);
    expect(isOverdue({ status: 'not_required', planned_date: null, due_date: '2026-10-01' }, TODAY)).toBe(false);
  });
  it('counts required, completed and remaining without waived items', () => {
    const list = [{ status: 'published' }, { status: 'scheduled' }, { status: 'not_required' }, { status: 'not_scheduled' }] as const;
    expect(progress([...list])).toEqual({ required: 3, completed: 1, remaining: 2 });
  });
});
