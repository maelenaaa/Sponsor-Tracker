import Link from 'next/link';
import { snoozeSponsorAction } from '@/app/actions';
import { addDays, formatDate, weekStart, type ISODate } from '@/lib/dates';
import type { Candidate } from '@/lib/domain/recommend';
import { ActionForm, SubmitButton } from './ActionForm';
import { PublishPopover, ScheduleForm } from './DeliverableActions';

export function suggestDate(today: ISODate): ISODate {
  const wed = addDays(weekStart(today), 2);
  return wed >= today ? wed : today;
}

/** The recommended sponsor, large. This is the one prominent thing on the dashboard and planner. */
export function Hero({
  c,
  today,
  platformLabel = 'website feature',
  defaultDate,
}: {
  c: Candidate;
  today: ISODate;
  platformLabel?: string;
  defaultDate?: ISODate;
}) {
  const d = c.next;
  return (
    <section aria-labelledby="hero-title" className="mb-8 border-l-8 border-orange bg-navy text-cream">
      <div className="px-5 pb-4 pt-5 sm:px-7">
        <p id="hero-title" className="text-sm text-cream/75">Feature next: {platformLabel}</p>
        <h2 className="mt-1 font-display text-4xl font-medium leading-tight text-white sm:text-5xl">
          <Link href={`/sponsors/${c.sponsor.id}`} className="text-white underline-offset-4 hover:underline">{c.sponsor.name}</Link>
        </h2>
        <p className="mt-1 text-cream/80">{d.label}</p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {c.reasons.map((r, i) => (
            <li key={r} className={i === 0 || r.startsWith('Never') || r.includes('overdue') ? 'font-medium text-orange' : 'text-cream/85'}>
              {r}
            </li>
          ))}
        </ul>
        {c.tieNote ? <p className="mt-2 text-xs text-cream/65">{c.tieNote}</p> : null}
      </div>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-white/15 bg-cream px-5 py-3 text-ink sm:px-7">
        <div>
          <p className="mb-1 text-xs font-medium text-ink/70">
            {d.planned_date ? `Planned ${formatDate(d.planned_date)}` : 'Pick a date'}
          </p>
          <ScheduleForm id={d.id} value={d.planned_date} defaultDate={defaultDate ?? suggestDate(today)} label="Schedule" accent />
        </div>
        <div className="pt-5"><PublishPopover id={d.id} today={today} /></div>
        <ActionForm action={snoozeSponsorAction} className="ml-auto pt-5" showSuccess={false}>
          <input type="hidden" name="sponsor_id" value={c.sponsor.id} />
          <SubmitButton variant="link">Skip for now</SubmitButton>
        </ActionForm>
      </div>
    </section>
  );
}
