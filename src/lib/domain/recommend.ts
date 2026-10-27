import { addDays, describeGap, diffDays, formatDate, type ISODate } from '../dates';
import { effectiveDate, isOpen, isOverdue } from './deliverables';
import type { DeliverableRow, Platform, SponsorRow } from './types';

/**
 * Who should be featured next on a platform?
 *
 * Eligibility
 *   - The sponsor is Active and not snoozed ("Skip for now").
 *   - The sponsor has at least one deliverable on that platform that needs action:
 *     open (not published, not waived), not already scheduled for today or later,
 *     and due within the lookahead window (or overdue, or undated).
 *
 * Ranking (first rule that differs wins), following the order in the brief:
 *   1. Outstanding deliverables (more first)
 *   2. Overdue (has an overdue one first)
 *   3. Longest time since the last published feature on that platform (never featured = longest)
 *   4. Earliest due or planned date
 *   5. Tie-breaks: earlier date added, then name A to Z, then id. Always the same result for the same data.
 */

export interface Candidate {
  sponsor: SponsorRow;
  /** Deliverables that need action, soonest first. */
  needsAction: DeliverableRow[];
  next: DeliverableRow;
  outstandingCount: number;
  overdueCount: number;
  lastPublished: ISODate | null;
  daysSinceLast: number | null;
  earliestDate: ISODate | null;
  reasons: string[];
  tieNote: string | null;
}

export interface Recommendation {
  ranked: Candidate[];
  snoozed: Candidate[];
}

export interface RecommendOptions {
  today: ISODate;
  lookaheadDays: number;
}

const NOUN: Record<Platform, string> = {
  website: 'website feature',
  linkedin: 'LinkedIn post',
  other: 'deliverable',
};
const PLACE: Record<Platform, string> = { website: 'on the website', linkedin: 'on LinkedIn', other: '' };

function needsAction(d: DeliverableRow, platform: Platform, o: RecommendOptions): boolean {
  if (d.platform !== platform || !isOpen(d.status)) return false;
  if (d.status === 'scheduled' && d.planned_date && d.planned_date >= o.today) return false; // already handled
  const date = effectiveDate(d);
  if (date === null) return true;
  return date <= addDays(o.today, o.lookaheadDays);
}

function cmpDate(a: ISODate | null, b: ISODate | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function keyOf(c: Candidate) {
  return [c.outstandingCount, c.overdueCount > 0 ? 1 : 0, c.daysSinceLast ?? Number.POSITIVE_INFINITY, c.earliestDate];
}

function compare(a: Candidate, b: Candidate): number {
  if (a.outstandingCount !== b.outstandingCount) return b.outstandingCount - a.outstandingCount;
  const ao = a.overdueCount > 0 ? 1 : 0;
  const bo = b.overdueCount > 0 ? 1 : 0;
  if (ao !== bo) return bo - ao;
  const ad = a.daysSinceLast ?? Number.POSITIVE_INFINITY;
  const bd = b.daysSinceLast ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad === Number.POSITIVE_INFINITY ? -1 : bd === Number.POSITIVE_INFINITY ? 1 : bd - ad;
  const dd = cmpDate(a.earliestDate, b.earliestDate);
  if (dd !== 0) return dd;
  return tieBreak(a, b);
}

function tieBreak(a: Candidate, b: Candidate): number {
  if (a.sponsor.date_added !== b.sponsor.date_added) return a.sponsor.date_added < b.sponsor.date_added ? -1 : 1;
  const n = a.sponsor.name.localeCompare(b.sponsor.name, 'en', { sensitivity: 'base' });
  if (n !== 0) return n;
  return a.sponsor.id < b.sponsor.id ? -1 : a.sponsor.id > b.sponsor.id ? 1 : 0;
}

function sameFactors(a: Candidate, b: Candidate): boolean {
  const ka = keyOf(a);
  const kb = keyOf(b);
  return ka.every((v, i) => v === kb[i]);
}

function buildReasons(c: Omit<Candidate, 'reasons' | 'tieNote'>, platform: Platform, today: ISODate): string[] {
  const reasons: string[] = [];
  const noun = NOUN[platform];
  reasons.push(`${c.outstandingCount} ${noun}${c.outstandingCount === 1 ? '' : 's'} outstanding`);
  if (c.overdueCount > 0) {
    const worst = c.needsAction.filter((d) => isOverdue(d, today)).map((d) => effectiveDate(d)!).sort()[0];
    reasons.push(`${c.overdueCount} overdue (due ${formatDate(worst, false)})`);
  }
  if (c.lastPublished === null) {
    reasons.push(`Never featured ${PLACE[platform]}`.trim());
  } else {
    reasons.push(`Last featured ${PLACE[platform]} ${describeGap(c.daysSinceLast!)}`.replace('  ', ' ').trim());
  }
  if (c.overdueCount === 0 && c.earliestDate) reasons.push(`Next due ${formatDate(c.earliestDate, false)}`);
  return reasons;
}

export function recommend(
  platform: Platform,
  sponsors: SponsorRow[],
  deliverables: DeliverableRow[],
  options: RecommendOptions,
): Recommendation {
  const { today } = options;
  const bySponsor = new Map<string, DeliverableRow[]>();
  for (const d of deliverables) {
    const list = bySponsor.get(d.sponsor_id);
    if (list) list.push(d);
    else bySponsor.set(d.sponsor_id, [d]);
  }

  const ranked: Candidate[] = [];
  const snoozed: Candidate[] = [];

  for (const sponsor of sponsors) {
    if (sponsor.status !== 'active') continue;
    const mine = bySponsor.get(sponsor.id) ?? [];
    const action = mine
      .filter((d) => needsAction(d, platform, options))
      .sort((a, b) => cmpDate(effectiveDate(a), effectiveDate(b)) || a.sequence_no - b.sequence_no);
    if (action.length === 0) continue;

    const published = mine
      .filter((d) => d.platform === platform && d.status === 'published' && d.actual_date)
      .map((d) => d.actual_date!)
      .sort();
    const lastPublished = published.length ? published[published.length - 1] : null;

    const base = {
      sponsor,
      needsAction: action,
      next: action[0],
      outstandingCount: action.length,
      overdueCount: action.filter((d) => isOverdue(d, today)).length,
      lastPublished,
      daysSinceLast: lastPublished ? diffDays(lastPublished, today) : null,
      earliestDate: effectiveDate(action[0]),
    };
    const candidate: Candidate = { ...base, reasons: buildReasons(base, platform, today), tieNote: null };
    if (sponsor.snoozed_until && sponsor.snoozed_until > today) snoozed.push(candidate);
    else ranked.push(candidate);
  }

  ranked.sort(compare);
  snoozed.sort(compare);

  ranked.forEach((c, i) => {
    const other = ranked[i + 1] ?? null;
    const prev = ranked[i - 1] ?? null;
    const tied = [other, prev].find((x) => x && sameFactors(c, x));
    if (tied) {
      c.tieNote = `Same priority as ${tied.sponsor.name}. Ordered by earlier date added, then name.`;
    }
  });

  return { ranked, snoozed };
}
