import Link from 'next/link';
import { PageHeader, btnLink, cx } from '@/components/ui';
import { addDays, addMonths, formatMonth, isISODate, monthStart, toUTC, weekStart, type ISODate } from '@/lib/dates';
import { isOverdue } from '@/lib/domain/deliverables';
import { loadWorkspace } from '@/lib/load';

export default async function CalendarPage({ searchParams }: { searchParams: { month?: string } }) {
  const { today, deliverables } = await loadWorkspace();
  const raw = searchParams.month && isISODate(`${searchParams.month}-01`) ? `${searchParams.month}-01` : monthStart(today);
  const first = monthStart(raw);
  const gridStart = weekStart(first);
  const nextMonth = addMonths(first, 1);
  const days: ISODate[] = [];
  for (let d = gridStart; days.length < 42; d = addDays(d, 1)) {
    days.push(d);
    if (days.length >= 35 && addDays(d, 1) >= nextMonth && toUTC(addDays(d, 1)).getUTCDay() === 1) break;
  }

  // Published items sit on the day they went out, everything else on its planned date.
  const byDay = new Map<ISODate, typeof deliverables>();
  for (const d of deliverables) {
    if (d.status === 'not_required') continue;
    const date = d.status === 'published' ? d.actual_date : d.planned_date;
    if (!date) continue;
    const list = byDay.get(date) ?? [];
    list.push(d);
    byDay.set(date, list);
  }
  const unscheduledDue = deliverables.filter(
    (d) => (d.status === 'not_scheduled') && d.due_date && d.due_date >= first && d.due_date < nextMonth,
  );

  const prev = addMonths(first, -1).slice(0, 7);
  const next = nextMonth.slice(0, 7);

  return (
    <>
      <PageHeader title={formatMonth(first)} sub="Navy is the website, orange is LinkedIn. Solid means published, outlined means planned, red means overdue.">
        <Link href={`/calendar?month=${prev}`} className={btnLink}>Previous</Link>
        <Link href="/calendar" className={btnLink}>Today</Link>
        <Link href={`/calendar?month=${next}`} className={btnLink}>Next</Link>
      </PageHeader>

      <div className="hidden grid-cols-7 border-l border-t border-line bg-white text-sm md:grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="border-b border-r border-line bg-cream-200 px-2 py-1.5 text-xs font-semibold text-ink/70">{d}</div>
        ))}
        {days.map((day) => {
          const inMonth = day >= first && day < nextMonth;
          const items = byDay.get(day) ?? [];
          return (
            <div key={day} className={cx('min-h-28 border-b border-r border-line p-1.5', !inMonth && 'bg-cream/70 text-ink/40', day === today && 'outline outline-2 -outline-offset-2 outline-orange')}>
              <div className="mb-1 text-xs tabular-nums">{Number(day.slice(8))}</div>
              <ul className="grid gap-1">{items.map((d) => <li key={d.id}><Chip d={d} today={today} /></li>)}</ul>
            </div>
          );
        })}
      </div>

      {/* On a phone the grid is unreadable, so list the same items by day. */}
      <div className="md:hidden">
        {days.filter((day) => day >= first && day < nextMonth && (byDay.get(day)?.length ?? 0) > 0).map((day) => (
          <section key={day} className="mb-3 border border-line bg-white p-3">
            <h2 className="mb-1 text-sm font-medium">{new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</h2>
            <ul className="grid gap-1">{byDay.get(day)!.map((d) => <li key={d.id}><Chip d={d} today={today} /></li>)}</ul>
          </section>
        ))}
        {days.every((day) => !(byDay.get(day)?.length)) ? <p className="text-sm text-ink/70">Nothing planned or published this month.</p> : null}
      </div>

      {unscheduledDue.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-xl text-navy">Due this month, not scheduled yet</h2>
          <ul className="grid gap-1 border border-line bg-white p-3 text-sm">
            {unscheduledDue.map((d) => (
              <li key={d.id}><Link href={`/sponsors/${d.sponsor_id}`} className="underline">{d.sponsor_name}</Link>: {d.label} <span className="text-ink/60">(due {d.due_date})</span></li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Chip({ d, today }: { d: Parameters<typeof isOverdue>[0] & { id: string; sponsor_id: string; sponsor_name?: string; platform: string; label: string; status: string }; today: ISODate }) {
  const late = isOverdue(d, today);
  const published = d.status === 'published';
  const base = d.platform === 'website' ? 'border-navy' : d.platform === 'linkedin' ? 'border-orange' : 'border-ink/40';
  const fill = published ? (d.platform === 'website' ? 'bg-navy text-white' : d.platform === 'linkedin' ? 'bg-orange text-ink' : 'bg-ink/70 text-white') : 'bg-white text-ink';
  return (
    <Link
      href={`/sponsors/${d.sponsor_id}`}
      title={`${d.sponsor_name ?? ''}: ${d.label}`}
      className={cx('block truncate border-2 px-1.5 py-0.5 text-xs leading-tight hover:underline', base, fill, late && '!border-late !text-late')}
    >
      {published ? '✓ ' : ''}{d.sponsor_name}
    </Link>
  );
}
