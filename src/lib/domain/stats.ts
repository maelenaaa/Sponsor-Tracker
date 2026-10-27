import { diffDays, type ISODate } from '../dates';
import { effectiveDate, isOpen, isOverdue, progress } from './deliverables';
import type { DeliverableRow, Platform, SponsorRow } from './types';

export interface PlatformSummary {
  required: number;
  completed: number;
  remaining: number;
  lastPublished: ISODate | null;
  daysSinceLast: number | null;
  /** Earliest planned date (today or later) among scheduled or in-progress deliverables. */
  nextScheduled: ISODate | null;
}

export interface SponsorSummary {
  required: number;
  completed: number;
  remaining: number;
  overdue: number;
  website: PlatformSummary;
  linkedin: PlatformSummary;
  lastAnyPublished: ISODate | null;
  daysSinceAny: number | null;
  /** Has deliverables, and every one that is required is published. */
  allDone: boolean;
}

function platformSummary(list: DeliverableRow[], platform: Platform, today: ISODate): PlatformSummary {
  const mine = list.filter((d) => d.platform === platform);
  const p = progress(mine);
  const published = mine
    .filter((d) => d.status === 'published' && d.actual_date)
    .map((d) => d.actual_date!)
    .sort();
  const last = published.length ? published[published.length - 1] : null;
  const upcoming = mine
    .filter((d) => (d.status === 'scheduled' || d.status === 'in_progress') && d.planned_date && d.planned_date >= today)
    .map((d) => d.planned_date!)
    .sort();
  return {
    ...p,
    lastPublished: last,
    daysSinceLast: last ? diffDays(last, today) : null,
    nextScheduled: upcoming[0] ?? null,
  };
}

export function summarize(list: DeliverableRow[], today: ISODate): SponsorSummary {
  const p = progress(list);
  const published = list
    .filter((d) => d.status === 'published' && d.actual_date)
    .map((d) => d.actual_date!)
    .sort();
  const last = published.length ? published[published.length - 1] : null;
  return {
    ...p,
    overdue: list.filter((d) => isOverdue(d, today)).length,
    website: platformSummary(list, 'website', today),
    linkedin: platformSummary(list, 'linkedin', today),
    lastAnyPublished: last,
    daysSinceAny: last ? diffDays(last, today) : null,
    allDone: p.required > 0 && p.remaining === 0,
  };
}

export function groupBySponsor(deliverables: DeliverableRow[]): Map<string, DeliverableRow[]> {
  const map = new Map<string, DeliverableRow[]>();
  for (const d of deliverables) {
    const list = map.get(d.sponsor_id);
    if (list) list.push(d);
    else map.set(d.sponsor_id, [d]);
  }
  return map;
}

export interface DashboardStats {
  activeSponsors: number;
  overdue: DeliverableRow[];
  upcoming: DeliverableRow[];
  website: { completed: number; remaining: number };
  linkedin: { completed: number; remaining: number };
  notYetFeatured: SponsorRow[];
  longestWithoutPost: { sponsor: SponsorRow; daysSince: number | null }[];
  upcomingScheduled: DeliverableRow[];
  completedSponsors: SponsorRow[];
}

export function dashboardStats(
  sponsors: SponsorRow[],
  deliverables: DeliverableRow[],
  today: ISODate,
  upcomingDays = 14,
): DashboardStats {
  const active = sponsors.filter((s) => s.status === 'active');
  const activeIds = new Set(active.map((s) => s.id));
  const mine = deliverables.filter((d) => activeIds.has(d.sponsor_id));
  const grouped = groupBySponsor(mine);
  const byDate = (a: DeliverableRow, b: DeliverableRow) =>
    (effectiveDate(a) ?? '9999').localeCompare(effectiveDate(b) ?? '9999');

  const overdue = mine.filter((d) => isOverdue(d, today)).sort(byDate);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + upcomingDays);
  const horizonStr = horizon.toISOString().slice(0, 10);
  const upcoming = mine
    .filter((d) => isOpen(d.status) && !isOverdue(d, today))
    .filter((d) => {
      const e = effectiveDate(d);
      return e !== null && e <= horizonStr;
    })
    .sort(byDate);

  const web = progress(mine.filter((d) => d.platform === 'website'));
  const li = progress(mine.filter((d) => d.platform === 'linkedin'));

  const rows = active.map((s) => ({ sponsor: s, sum: summarize(grouped.get(s.id) ?? [], today) }));

  return {
    activeSponsors: active.length,
    overdue,
    upcoming,
    website: { completed: web.completed, remaining: web.remaining },
    linkedin: { completed: li.completed, remaining: li.remaining },
    notYetFeatured: rows
      .filter((r) => r.sum.website.required > 0 && r.sum.website.completed === 0)
      .map((r) => r.sponsor),
    longestWithoutPost: rows
      .filter((r) => r.sum.required > 0 && r.sum.remaining > 0)
      .map((r) => ({ sponsor: r.sponsor, daysSince: r.sum.daysSinceAny }))
      .sort((a, b) => {
        const ad = a.daysSince ?? Number.POSITIVE_INFINITY;
        const bd = b.daysSince ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad === Number.POSITIVE_INFINITY ? -1 : bd === Number.POSITIVE_INFINITY ? 1 : bd - ad;
        return a.sponsor.name.localeCompare(b.sponsor.name);
      })
      .slice(0, 5),
    upcomingScheduled: mine
      .filter((d) => d.status === 'scheduled' && d.planned_date && d.planned_date >= today)
      .sort((a, b) => a.planned_date!.localeCompare(b.planned_date!))
      .slice(0, 6),
    completedSponsors: rows.filter((r) => r.sum.allDone).map((r) => r.sponsor),
  };
}
