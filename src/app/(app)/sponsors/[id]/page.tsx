import Link from 'next/link';
import { notFound } from 'next/navigation';
import { applySyncAction, createManualAction, deleteSponsorAction } from '@/app/actions';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { DeliverableTable } from '@/components/DeliverableTable';
import { SponsorForm } from '@/components/SponsorForm';
import { Empty, ExtLink, Field, PageHeader, ProgressBar, Section, SponsorStatusBadge, inputCls } from '@/components/ui';
import { config } from '@/lib/config';
import { describeGap, formatDate } from '@/lib/dates';
import { getSql } from '@/lib/db';
import { summarize, type PlatformSummary } from '@/lib/domain/stats';
import { PLATFORMS, PLATFORM_LABEL } from '@/lib/domain/types';
import { describeEvent, formatStamp } from '@/lib/events-text';
import { z } from 'zod';
import { listDeliverables, listEvents } from '@/lib/services/deliverables';
import { listPackages } from '@/lib/services/packages';
import { getSponsor } from '@/lib/services/sponsors';
import { previewSync } from '@/lib/services/sync';

export default async function SponsorPage({ params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const sql = getSql();
  const today = config.today();
  const sponsor = await getSponsor(sql, params.id);
  if (!sponsor) notFound();

  const [deliverables, events, packages, preview] = await Promise.all([
    listDeliverables(sql, { sponsorId: sponsor.id }),
    listEvents(sql, { sponsorId: sponsor.id, limit: 100 }),
    listPackages(sql),
    previewSync(sql, sponsor.id, { today, horizonDays: config.generationHorizonDays }),
  ]);
  const sum = summarize(deliverables, today);
  const open = (d: (typeof deliverables)[number]) => (d.status === 'published' || d.status === 'not_required' ? 1 : 0);
  const showReview = preview.changed && preview.hasChanges;

  return (
    <>
      <PageHeader title={sponsor.name} sub={<>
        <SponsorStatusBadge status={sponsor.status} />{' '}
        {sponsor.package_name ? <>Package: {sponsor.package_name}. </> : 'No package. '}
        {sponsor.start_date ? <>Starts {formatDate(sponsor.start_date)}. </> : null}
        {sponsor.end_date ? <>Ends {formatDate(sponsor.end_date)}.</> : null}
      </>}>
        <Link href="#edit" className="inline-flex border border-navy/30 px-3.5 py-2 text-sm font-medium text-navy hover:bg-navy-100">Edit details</Link>
      </PageHeader>

      <p className="-mt-3 mb-6 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {sponsor.contact_name ? <span>{sponsor.contact_name}</span> : null}
        {sponsor.email ? <ExtLink href={`mailto:${sponsor.email}`}>{sponsor.email}</ExtLink> : null}
        {sponsor.website_url ? <ExtLink href={sponsor.website_url}>Website</ExtLink> : null}
        {sponsor.linkedin_url ? <ExtLink href={sponsor.linkedin_url}>LinkedIn</ExtLink> : null}
      </p>

      {showReview ? (
        <section className="mb-8 border-l-8 border-orange bg-orange-100 px-5 py-4" aria-labelledby="review-title">
          <h2 id="review-title" className="font-display text-xl text-navy">Review package changes</h2>
          <p className="mt-1 text-sm">The package or the sponsor’s dates changed. Nothing has been changed yet. Published deliverables are never touched.</p>
          <div className="mt-3 grid gap-4 text-sm md:grid-cols-3">
            <ReviewList title="Will be added" items={preview.plan.toCreate.map((c) => `${c.label} (due ${formatDate(c.due_date, false)})`)} />
            <ReviewList title="Will be marked not required" items={preview.plan.toRetire.map((d) => `${d.label}${d.planned_date ? `, planned ${formatDate(d.planned_date, false)}` : ''}`)} />
            <ReviewList title="Due dates that move" items={preview.plan.toUpdateDue.map((u) => `${u.deliverable.label}: ${formatDate(u.deliverable.due_date, false)} to ${formatDate(u.newDue, false)}`)} />
          </div>
          <ActionForm action={applySyncAction} className="mt-4 flex flex-wrap items-center gap-3">
            <input type="hidden" name="sponsor_id" value={sponsor.id} />
            <SubmitButton variant="accent" pendingText="Applying…">Apply these changes</SubmitButton>
            <span className="text-xs text-ink/70">Planned dates you set are kept. You can edit any deliverable afterward.</span>
          </ActionForm>
        </section>
      ) : null}

      <dl className="mb-8 grid gap-px border border-line bg-line md:grid-cols-3">
        <div className="bg-white px-4 py-3">
          <dt className="text-sm text-ink/70">Delivered</dt>
          <dd className="mt-1">{sum.required ? <ProgressBar done={sum.completed} total={sum.required} /> : <span className="text-ink/60">No deliverables yet</span>}</dd>
          <dd className="mt-1 text-sm text-ink/70">{sum.remaining} remaining{sum.overdue ? <span className="font-medium text-late"> · {sum.overdue} overdue</span> : null}</dd>
        </div>
        <PlatformCard title="Website" p={sum.website} />
        <PlatformCard title="LinkedIn" p={sum.linkedin} />
      </dl>

      {PLATFORMS.map((platform) => {
        const rows = deliverables.filter((d) => d.platform === platform).sort((a, b) => open(a) - open(b));
        if (rows.length === 0 && platform === 'other') return null;
        return (
          <Section key={platform} title={PLATFORM_LABEL[platform]}>
            <DeliverableTable rows={rows} today={today} showSponsor={false} empty={`No ${PLATFORM_LABEL[platform]} deliverables for this sponsor.`} />
          </Section>
        );
      })}

      <details className="mb-8 border border-line bg-white px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-navy">Add a one-off deliverable</summary>
        <ActionForm action={createManualAction} className="mt-3 grid gap-3 md:grid-cols-4" resetOnSuccess>
          <input type="hidden" name="sponsor_id" value={sponsor.id} />
          <Field label="What is it?" className="md:col-span-2"><input name="label" required className={inputCls} placeholder="Event shout-out" /></Field>
          <Field label="Where">
            <select name="platform" className={inputCls}>{PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select>
          </Field>
          <Field label="Planned date"><input type="date" name="planned_date" className={inputCls} /></Field>
          <div className="md:col-span-4"><SubmitButton>Add deliverable</SubmitButton></div>
        </ActionForm>
      </details>

      <Section title="History" aside="Every schedule change and publication, newest first">
        {events.length === 0 ? <Empty>No history yet.</Empty> : (
          <ol className="divide-y divide-line border border-line bg-white text-sm">
            {events.map((e) => {
              const { text, url } = describeEvent(e);
              return (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-3 py-2">
                  <span>{text}{url ? <> · <ExtLink href={url}>link</ExtLink></> : null}</span>
                  <time className="text-xs text-ink/55" dateTime={new Date(e.created_at).toISOString()}>{formatStamp(e.created_at, config.timeZone)}</time>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <Section id="edit" title="Edit sponsor">
        <div className="max-w-3xl border border-line bg-white p-5">
          <SponsorForm sponsor={sponsor} packages={packages} />
        </div>
        <div className="mt-6 max-w-3xl border border-line bg-white p-5">
          <h3 className="font-medium">Delete this sponsor</h3>
          <p className="mb-3 mt-1 text-sm text-ink/70">Only possible when nothing has been published for them. Otherwise set the status to Inactive so the history stays.</p>
          <ActionForm action={deleteSponsorAction}>
            <input type="hidden" name="id" value={sponsor.id} />
            <SubmitButton variant="danger" confirm={`Delete ${sponsor.name} and all of their deliverables?`}>Delete sponsor</SubmitButton>
          </ActionForm>
        </div>
      </Section>
    </>
  );
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium">{title} ({items.length})</p>
      {items.length === 0 ? <p className="text-ink/60">None</p> : <ul className="list-disc pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>}
    </div>
  );
}

function PlatformCard({ title, p }: { title: string; p: PlatformSummary }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-sm text-ink/70">{title}</dt>
      {p.required === 0 ? (
        <dd className="mt-1 text-ink/60">Not part of this package</dd>
      ) : (
        <>
          <dd className="mt-1">{p.lastPublished ? <>Last published {formatDate(p.lastPublished)} <span className="text-ink/60">({describeGap(p.daysSinceLast!)})</span></> : 'Never published'}</dd>
          <dd className="text-sm text-ink/70">
            {p.completed}/{p.required} done · {p.nextScheduled ? `Next scheduled ${formatDate(p.nextScheduled)}` : 'Nothing scheduled'}
          </dd>
        </>
      )}
    </div>
  );
}
