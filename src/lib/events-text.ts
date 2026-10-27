import { formatDate } from './dates';
import { STATUS_LABEL, type DeliverableStatus } from './domain/types';
import type { EventRow } from './services/deliverables';

const status = (s: unknown) => STATUS_LABEL[s as DeliverableStatus] ?? String(s);
const date = (d: unknown) => (typeof d === 'string' && d ? formatDate(d) : 'no date');

/** One readable sentence per history entry. */
export function describeEvent(e: EventRow): { text: string; url?: string } {
  const d = e.detail as Record<string, any>;
  const label = e.label ?? d.label ?? 'Deliverable';
  switch (e.event_type) {
    case 'sponsor_created': return { text: `Sponsor added` };
    case 'generated': return { text: `${label} added from the package, due ${date(d.due_date)}` };
    case 'created': return { text: `${label} added by hand` };
    case 'scheduled': return { text: `${label} scheduled for ${date(d.to)}` };
    case 'rescheduled': return { text: `${label} moved from ${date(d.from)} to ${date(d.to)}` };
    case 'unscheduled': return { text: `${label} schedule cleared (was ${date(d.from)})` };
    case 'status_changed': return { text: `${label} changed from ${status(d.from)} to ${status(d.to)}` };
    case 'published': return { text: `${label} published on ${date(d.actual_date)}`, url: d.published_url ?? undefined };
    case 'publish_corrected':
      return { text: `${label} publication details corrected to ${date(d.to?.actual_date)}`, url: d.to?.published_url ?? undefined };
    case 'unpublished': return { text: `${label} publish undone (was ${date(d.was?.actual_date)})` };
    case 'retired': return { text: `${label} marked not required after a package change` };
    case 'due_changed': return { text: `${label} due date changed from ${date(d.from)} to ${date(d.to)}` };
    case 'deleted': return { text: `${label} deleted` };
    default: return { text: `${label}: ${e.event_type}` };
  }
}

export function formatStamp(ts: Date | string, timeZone: string): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return new Intl.DateTimeFormat('en-US', {
    timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d);
}
