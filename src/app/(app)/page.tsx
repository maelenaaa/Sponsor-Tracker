import Link from 'next/link';
import { Hero } from '@/components/CandidateCard';
import { DeliverableTable } from '@/components/DeliverableTable';
import { Empty, PageHeader, Section, SponsorLink, btnLink } from '@/components/ui';
import { describeGap, formatDate } from '@/lib/dates';
import { recommend } from '@/lib/domain/recommend';
import { dashboardStats } from '@/lib/domain/stats';
import { loadWorkspace } from '@/lib/load';

export default async function Dashboard() {
  const { today, sponsors, deliverables, lookaheadDays } = await loadWorkspace();
  const stats = dashboardStats(sponsors, deliverables, today);
  const web = recommend('website', sponsors, deliverables, { today, lookaheadDays });
  const next = web.ranked[0];
  const noSponsors = sponsors.length === 0;

  return (
    <>
      <PageHeader title="This week" sub={`Today is ${formatDate(today)}.`}>
        <Link href="/planner" className={btnLink}>Open weekly planner</Link>
        <Link href="/sponsors/new" className={btnLink}>Add sponsor</Link>
      </PageHeader>

      {noSponsors ? (
        <Empty>
          No sponsors yet. <Link href="/sponsors/new" className="font-medium text-navy underline">Add your first sponsor</Link> and pick a package to generate its deliverables. Check <Link href="/packages" className="font-medium text-navy underline">Packages</Link> first so the deliverables match your real commitments.
        </Empty>
      ) : next ? (
        <Hero c={next} today={today} />
      ) : (
        <div className="mb-8 border-l-8 border-ok bg-white px-5 py-5">
          <p className="font-display text-2xl text-navy">No website feature is waiting.</p>
          <p className="mt-1 text-sm text-ink/70">
            Every active sponsor has their website feature published or already scheduled.
            {web.snoozed.length ? ` ${web.snoozed.length} skipped sponsor${web.snoozed.length === 1 ? ' is' : 's are'} waiting in the planner.` : ''}
          </p>
        </div>
      )}

      <dl className="mb-8 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
        <Stat label="Active sponsors" value={stats.activeSponsors} />
        <Stat label="Overdue" value={stats.overdue.length} tone={stats.overdue.length ? 'late' : undefined} href="/deliverables?overdue=1" />
        <Stat label="Website features" value={`${stats.website.completed} done`} sub={`${stats.website.remaining} remaining`} href="/deliverables?platform=website" />
        <Stat label="LinkedIn posts" value={`${stats.linkedin.completed} done`} sub={`${stats.linkedin.remaining} remaining`} href="/deliverables?platform=linkedin" />
      </dl>

      {stats.overdue.length > 0 ? (
        <Section title="Overdue" aside={<Link href="/deliverables?overdue=1" className="underline">See all {stats.overdue.length}</Link>}>
          <DeliverableTable rows={stats.overdue.slice(0, 5)} today={today} />
        </Section>
      ) : null}

      <Section title="Scheduled next" aside={<Link href="/calendar" className="underline">Calendar</Link>}>
        <DeliverableTable rows={stats.upcomingScheduled} today={today} empty="Nothing is scheduled yet. Use the planner to schedule this week's feature." />
      </Section>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Not featured yet">
          {stats.notYetFeatured.length === 0 ? (
            <Empty>Every active sponsor has had a website feature.</Empty>
          ) : (
            <ul className="divide-y divide-line border border-line bg-white">
              {stats.notYetFeatured.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <SponsorLink id={s.id} name={s.name} />
                  <span className="text-ink/60">Added {formatDate(s.date_added)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Longest without a post">
          {stats.longestWithoutPost.length === 0 ? (
            <Empty>No sponsors have outstanding deliverables.</Empty>
          ) : (
            <ul className="divide-y divide-line border border-line bg-white">
              {stats.longestWithoutPost.map(({ sponsor, daysSince }) => (
                <li key={sponsor.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <SponsorLink id={sponsor.id} name={sponsor.name} />
                  <span className="text-ink/60">{daysSince === null ? 'Never posted' : `Last post ${describeGap(daysSince)}`}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {stats.upcoming.length > 0 ? (
        <Section title="Due in the next two weeks" aside={`${stats.upcoming.length} deliverable${stats.upcoming.length === 1 ? '' : 's'}`}>
          <DeliverableTable rows={stats.upcoming.slice(0, 8)} today={today} />
        </Section>
      ) : null}
    </>
  );
}

function Stat({ label, value, sub, tone, href }: { label: string; value: string | number; sub?: string; tone?: 'late'; href?: string }) {
  const body = (
    <div className="h-full bg-white px-4 py-3">
      <dt className="text-sm text-ink/70">{label}</dt>
      <dd className={`font-display text-3xl font-medium ${tone === 'late' ? 'text-late' : 'text-navy'}`}>{value}</dd>
      {sub ? <dd className="text-sm text-ink/60">{sub}</dd> : null}
    </div>
  );
  return href ? <Link href={href} className="block h-full hover:bg-cream-200">{body}</Link> : body;
}
