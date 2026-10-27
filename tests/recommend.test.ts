import { describe, expect, it } from 'vitest';
import { recommend } from '@/lib/domain/recommend';
import { dashboardStats } from '@/lib/domain/stats';
import { deliverable, sponsor } from './fixtures';

const TODAY = '2026-10-27';
const o = { today: TODAY, lookaheadDays: 30 };

describe('recommend (website)', () => {
  it('puts the sponsor with more outstanding deliverables first', () => {
    const a = sponsor({ name: 'A' });
    const b = sponsor({ name: 'B' });
    const ds = [
      deliverable(a.id, { due_date: '2026-10-01' }),
      deliverable(b.id, { due_date: '2026-10-01' }),
      deliverable(b.id, { due_date: '2026-10-01', sequence_no: 2 }),
    ];
    const { ranked } = recommend('website', [a, b], ds, o);
    expect(ranked.map((c) => c.sponsor.name)).toEqual(['B', 'A']);
    expect(ranked[0].reasons[0]).toBe('2 website features outstanding');
  });

  it('prefers overdue, then longest since last feature, with never featured counting as longest', () => {
    const overdue = sponsor({ name: 'Overdue' });
    const longAgo = sponsor({ name: 'Long ago' });
    const recent = sponsor({ name: 'Recent' });
    const never = sponsor({ name: 'Never' });
    const ds = [
      deliverable(overdue.id, { due_date: '2026-10-01' }),
      deliverable(longAgo.id, { due_date: '2026-11-10' }),
      deliverable(recent.id, { due_date: '2026-11-10' }),
      deliverable(never.id, { due_date: '2026-11-10' }),
      deliverable(longAgo.id, { status: 'published', actual_date: '2026-06-01', sequence_no: 9 }),
      deliverable(recent.id, { status: 'published', actual_date: '2026-10-15', sequence_no: 9 }),
    ];
    const { ranked } = recommend('website', [recent, never, longAgo, overdue], ds, o);
    expect(ranked.map((c) => c.sponsor.name)).toEqual(['Overdue', 'Never', 'Long ago', 'Recent']);
    expect(ranked[1].reasons).toContain('Never featured on the website');
  });

  it('skips sponsors whose website deliverable is published, scheduled ahead, or not yet due', () => {
    const done = sponsor({ name: 'Done' });
    const scheduled = sponsor({ name: 'Scheduled' });
    const later = sponsor({ name: 'Later' });
    const paused = sponsor({ name: 'Paused', status: 'paused' });
    const needs = sponsor({ name: 'Needs' });
    const ds = [
      deliverable(done.id, { status: 'published', actual_date: '2026-10-01' }),
      deliverable(scheduled.id, { status: 'scheduled', planned_date: '2026-11-03', due_date: '2026-10-01' }),
      deliverable(later.id, { due_date: '2027-03-01' }),
      deliverable(paused.id, { due_date: '2026-10-01' }),
      deliverable(needs.id, { due_date: '2026-10-20' }),
      deliverable(needs.id, { platform: 'linkedin', sequence_no: 2, due_date: '2026-10-20' }),
    ];
    const { ranked } = recommend('website', [done, scheduled, later, paused, needs], ds, o);
    expect(ranked.map((c) => c.sponsor.name)).toEqual(['Needs']);
  });

  it('treats a scheduled deliverable whose date has passed as needing action', () => {
    const s = sponsor({ name: 'Slipped' });
    const ds = [deliverable(s.id, { status: 'scheduled', planned_date: '2026-10-15', due_date: '2026-10-01' })];
    const { ranked } = recommend('website', [s], ds, o);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].overdueCount).toBe(1);
  });

  it('keeps website and LinkedIn separate', () => {
    const s = sponsor({ name: 'Both' });
    const ds = [
      deliverable(s.id, { platform: 'website', status: 'published', actual_date: '2026-10-01', sequence_no: 1 }),
      deliverable(s.id, { platform: 'linkedin', due_date: '2026-10-20', sequence_no: 2 }),
    ];
    expect(recommend('website', [s], ds, o).ranked).toHaveLength(0);
    expect(recommend('linkedin', [s], ds, o).ranked).toHaveLength(1);
  });

  it('moves snoozed sponsors out of the ranking until the snooze ends', () => {
    const a = sponsor({ name: 'A', snoozed_until: '2026-11-02' });
    const b = sponsor({ name: 'B' });
    const ds = [deliverable(a.id, { due_date: '2026-10-01' }), deliverable(b.id, { due_date: '2026-10-10' })];
    const r = recommend('website', [a, b], ds, o);
    expect(r.ranked.map((c) => c.sponsor.name)).toEqual(['B']);
    expect(r.snoozed.map((c) => c.sponsor.name)).toEqual(['A']);
  });

  it('breaks ties the same way every time and says so', () => {
    const early = sponsor({ name: 'Zed', date_added: '2026-02-01' });
    const late = sponsor({ name: 'Alpha', date_added: '2026-05-01' });
    const ds = [deliverable(early.id, { due_date: '2026-10-01' }), deliverable(late.id, { due_date: '2026-10-01' })];
    const one = recommend('website', [late, early], ds, o).ranked;
    const two = recommend('website', [early, late], ds, o).ranked;
    expect(one.map((c) => c.sponsor.name)).toEqual(['Zed', 'Alpha']);
    expect(two.map((c) => c.sponsor.name)).toEqual(['Zed', 'Alpha']);
    expect(one[0].tieNote).toContain('Same priority as Alpha');
  });
});

describe('dashboardStats', () => {
  it('summarizes the numbers shown on the dashboard', () => {
    const a = sponsor({ name: 'A' });
    const b = sponsor({ name: 'B' });
    const inactive = sponsor({ name: 'C', status: 'inactive' });
    const ds = [
      deliverable(a.id, { due_date: '2026-10-01' }),
      deliverable(a.id, { platform: 'linkedin', status: 'scheduled', planned_date: '2026-10-30', due_date: '2026-10-01', sequence_no: 2 }),
      deliverable(b.id, { status: 'published', actual_date: '2026-10-05' }),
      deliverable(inactive.id, { due_date: '2026-09-01' }),
    ];
    const s = dashboardStats([a, b, inactive], ds, TODAY);
    expect(s.activeSponsors).toBe(2);
    expect(s.overdue).toHaveLength(1);
    expect(s.website).toEqual({ completed: 1, remaining: 1 });
    expect(s.linkedin).toEqual({ completed: 0, remaining: 1 });
    expect(s.notYetFeatured.map((x) => x.name)).toEqual(['A']);
    expect(s.upcomingScheduled).toHaveLength(1);
    expect(s.completedSponsors.map((x) => x.name)).toEqual(['B']);
  });
});
