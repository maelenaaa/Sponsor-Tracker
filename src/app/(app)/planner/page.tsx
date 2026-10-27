import Link from 'next/link';
import { snoozeSponsorAction } from '@/app/actions';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Hero } from '@/components/CandidateCard';
import { ScheduleForm } from '@/components/DeliverableActions';
import { DeliverableTable } from '@/components/DeliverableTable';
import { Empty, PageHeader, Section, SponsorLink, btnLink } from '@/components/ui';
import { addDays, formatDate, formatWeekRange, inRange, isISODate, weekStart } from '@/lib/dates';
import { recommend } from '@/lib/domain/recommend';
import { dashboardStats } from '@/lib/domain/stats';
import { loadWorkspace } from '@/lib/load';

export default async function Planner({ searchParams }: { searchParams: { week?: string } }) {
  const { today, sponsors, deliverables, lookaheadDays } = await loadWorkspace();
  const thisWeek = weekStart(today);
  const start = searchParams.week && isISODate(searchParams.week) ? weekStart(searchParams.week) : thisWeek;
  const end = addDays(start, 6);
  // Suggest Wednesday of the week, or today if Wednesday has already passed.
  const wednesday = addDays(start, 2);
  const defaultDate = today > wednesday && today <= end ? today : wednesday;
  const isCurrent = start === thisWeek;

  const web = recommend('website', sponsors, deliverables, { today, lookaheadDays });
  const li = recommend('linkedin', sponsors, deliverables, { today, lookaheadDays });
  const stats = dashboardStats(sponsors, deliverables, today);

  const inWeek = (d: (typeof deliverables)[number]) => {
    const date = d.status === 'published' ? d.actual_date : d.planned_date;
    return !!date && inRange(date, start, end) && d.status !== 'not_required';
  };
  const weekWebsite = deliverables.filter((d) => d.platform === 'website' && inWeek(d));
  const weekLinkedIn = deliverables.filter((d) => d.platform === 'linkedin' && inWeek(d));
  const later = deliverables
    .filter((d) => (d.status === 'scheduled' || d.status === 'in_progress') && d.planned_date && d.planned_date > end && d.planned_date <= addDays(end, 28))
    .sort((a, b) => a.planned_date!.localeCompare(b.planned_date!));

  const hasWebsiteSlot = weekWebsite.length > 0;
  const top = web.ranked[0];

  return (
    <>
      <PageHeader title="Weekly planner" sub={`${formatWeekRange(start)}${isCurrent ? ' (this week)' : ''}`}>
        <Link href={`/planner?week=${addDays(start, -7)}`} className={btnLink}>Previous week</Link>
        {!isCurrent ? <Link href="/planner" className={btnLink}>This week</Link> : null}
        <Link href={`/planner?week=${addDays(start, 7)}`} className={btnLink}>Next week</Link>
      </PageHeader>

      <Section title="Website feature for this week">
        {hasWebsiteSlot ? (
          <>
            <DeliverableTable rows={weekWebsite} today={today} />
            {top ? <p className="mt-2 text-sm text-ink/70">Next in the queue after this: <SponsorLink id={top.sponsor.id} name={top.sponsor.name} />.</p> : null}
          </>
        ) : top ? (
          <Hero c={top} today={today} defaultDate={defaultDate} />
        ) : (
          <Empty>No website feature is waiting. Every active sponsor has theirs published or scheduled.</Empty>
        )}
      </Section>

      <Section title="Website queue" aside="Ranked by outstanding work, overdue, time since last feature, then due date">
        {web.ranked.length === 0 ? (
          <Empty>Nobody is waiting for a website feature.</Empty>
        ) : (
          <ol className="divide-y divide-line border border-line bg-white">
            {web.ranked.map((c, i) => (
              <li key={c.sponsor.id} className="grid gap-3 px-4 py-3 md:grid-cols-[2rem_1fr_auto] md:items-center">
                <span className="font-display text-xl text-navy" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
                <div>
                  <SponsorLink id={c.sponsor.id} name={c.sponsor.name} />
                  <span className="text-sm text-ink/60"> · {c.next.label}</span>
                  <p className="text-sm text-ink/80">{c.reasons.join(' · ')}</p>
                  {c.tieNote ? <p className="text-xs text-ink/55">{c.tieNote}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ScheduleForm id={c.next.id} value={c.next.planned_date} defaultDate={defaultDate} label="Schedule" accent={i === 0} />
                  <ActionForm action={snoozeSponsorAction} showSuccess={false}>
                    <input type="hidden" name="sponsor_id" value={c.sponsor.id} />
                    <SubmitButton variant="link">Skip</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ol>
        )}
        {web.snoozed.length > 0 ? (
          <div className="mt-3 border border-line bg-cream-200 px-4 py-3 text-sm">
            <p className="mb-1 font-medium">Skipped for now</p>
            <ul className="grid gap-1">
              {web.snoozed.map((c) => (
                <li key={c.sponsor.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span><SponsorLink id={c.sponsor.id} name={c.sponsor.name} /> <span className="text-ink/60">until {formatDate(c.sponsor.snoozed_until, false)}</span></span>
                  <ActionForm action={snoozeSponsorAction} showSuccess={false}>
                    <input type="hidden" name="sponsor_id" value={c.sponsor.id} />
                    <input type="hidden" name="clear" value="true" />
                    <SubmitButton variant="link">Put back in the queue</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title="LinkedIn posts due next" aside="One per sponsor, most urgent first">
        <DeliverableTable rows={li.ranked.map((c) => c.next)} today={today} empty="No LinkedIn posts are waiting." />
        {weekLinkedIn.length > 0 ? (
          <>
            <h3 className="mb-1 mt-5 text-sm font-medium text-ink/80">LinkedIn this week</h3>
            <DeliverableTable rows={weekLinkedIn} today={today} />
          </>
        ) : null}
      </Section>

      <Section title="Scheduled in the next four weeks after this one">
        <DeliverableTable rows={later} today={today} empty="Nothing scheduled further out." />
      </Section>

      <Section title="Fully delivered">
        {stats.completedSponsors.length === 0 ? (
          <Empty>No sponsor has finished all their required deliverables yet.</Empty>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {stats.completedSponsors.map((s) => (
              <li key={s.id} className="border border-line bg-white px-3 py-1.5 text-sm"><SponsorLink id={s.id} name={s.name} /></li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
