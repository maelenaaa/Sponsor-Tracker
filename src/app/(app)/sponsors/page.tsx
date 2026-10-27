import Link from 'next/link';
import { Empty, PageHeader, SponsorLink, SponsorStatusBadge, Table, ProgressBar, btnLink, inputCls, td, th } from '@/components/ui';
import { describeGap, formatDate } from '@/lib/dates';
import { getSql } from '@/lib/db';
import { groupBySponsor, summarize, type SponsorSummary } from '@/lib/domain/stats';
import { SPONSOR_STATUSES, SPONSOR_STATUS_LABEL } from '@/lib/domain/types';
import { loadWorkspace } from '@/lib/load';
import { listPackages } from '@/lib/services/packages';

interface Params {
  q?: string;
  package?: string;
  status?: string;
  show?: string;
  sort?: string;
}

const SORTS: Record<string, string> = {
  name: 'Name',
  website: 'Longest since website feature',
  linkedin: 'Longest since LinkedIn post',
  remaining: 'Most remaining',
  next: 'Next scheduled',
  added: 'Recently added',
};

const gapKey = (days: number | null) => (days === null ? Number.POSITIVE_INFINITY : days);

export default async function Sponsors({ searchParams }: { searchParams: Params }) {
  const { today, sponsors, deliverables } = await loadWorkspace();
  const packages = await listPackages(getSql());
  const grouped = groupBySponsor(deliverables);
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const sort = searchParams.sort && SORTS[searchParams.sort] ? searchParams.sort : 'name';

  let rows = sponsors.map((s) => ({ s, sum: summarize(grouped.get(s.id) ?? [], today) }));
  if (q) rows = rows.filter(({ s }) => [s.name, s.contact_name, s.email].some((v) => v?.toLowerCase().includes(q)));
  if (searchParams.package === 'none') rows = rows.filter(({ s }) => !s.package_id);
  else if (searchParams.package) rows = rows.filter(({ s }) => s.package_id === searchParams.package);
  if (searchParams.status) rows = rows.filter(({ s }) => s.status === searchParams.status);
  if (searchParams.show === 'outstanding') rows = rows.filter(({ sum }) => sum.remaining > 0);
  if (searchParams.show === 'overdue') rows = rows.filter(({ sum }) => sum.overdue > 0);
  if (searchParams.show === 'never') rows = rows.filter(({ sum }) => sum.website.required > 0 && sum.website.completed === 0);

  const cmp: Record<string, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    name: (a, b) => a.s.name.localeCompare(b.s.name),
    website: (a, b) => gapKey(b.sum.website.daysSinceLast) - gapKey(a.sum.website.daysSinceLast) || a.s.name.localeCompare(b.s.name),
    linkedin: (a, b) => gapKey(b.sum.linkedin.daysSinceLast) - gapKey(a.sum.linkedin.daysSinceLast) || a.s.name.localeCompare(b.s.name),
    remaining: (a, b) => b.sum.remaining - a.sum.remaining || a.s.name.localeCompare(b.s.name),
    next: (a, b) => nextOf(a.sum).localeCompare(nextOf(b.sum)) || a.s.name.localeCompare(b.s.name),
    added: (a, b) => b.s.date_added.localeCompare(a.s.date_added) || a.s.name.localeCompare(b.s.name),
  };
  rows.sort(cmp[sort]);

  return (
    <>
      <PageHeader title="Sponsors" sub={`${rows.length} of ${sponsors.length} shown`}>
        <Link href="/sponsors/new" className="inline-flex bg-navy px-3.5 py-2 text-sm font-medium text-cream hover:bg-navy-900">Add sponsor</Link>
      </PageHeader>

      <form method="get" className="mb-4 grid gap-3 border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-2"><span className="sr-only">Search</span>
          <input name="q" defaultValue={searchParams.q ?? ''} placeholder="Search name, contact or email" className={inputCls} />
        </label>
        <label><span className="sr-only">Package</span>
          <select name="package" defaultValue={searchParams.package ?? ''} className={inputCls}>
            <option value="">All packages</option>
            <option value="none">No package</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Status</span>
          <select name="status" defaultValue={searchParams.status ?? ''} className={inputCls}>
            <option value="">Any status</option>
            {SPONSOR_STATUSES.map((s) => <option key={s} value={s}>{SPONSOR_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Show</span>
          <select name="show" defaultValue={searchParams.show ?? ''} className={inputCls}>
            <option value="">All sponsors</option>
            <option value="outstanding">With outstanding deliverables</option>
            <option value="overdue">With overdue deliverables</option>
            <option value="never">Never featured on the website</option>
          </select>
        </label>
        <label><span className="sr-only">Sort</span>
          <select name="sort" defaultValue={sort} className={inputCls}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v}</option>)}
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <button className="bg-navy px-3.5 py-2 text-sm font-medium text-cream hover:bg-navy-900">Apply</button>
          <Link href="/sponsors" className={btnLink}>Clear</Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{sponsors.length === 0 ? 'No sponsors yet. Use Add sponsor to create the first one.' : 'No sponsors match those filters.'}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th className={th}>Sponsor</th>
              <th className={th}>Package</th>
              <th className={th}>Delivered</th>
              <th className={th}>Website</th>
              <th className={th}>LinkedIn</th>
              <th className={th}>Next scheduled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, sum }) => (
              <tr key={s.id}>
                <td className={td}>
                  <SponsorLink id={s.id} name={s.name} />
                  <div className="mt-0.5 flex items-center gap-2"><SponsorStatusBadge status={s.status} />
                    {sum.overdue > 0 ? <span className="text-xs font-medium text-late">{sum.overdue} overdue</span> : null}
                  </div>
                </td>
                <td className={td}>{s.package_name ?? <span className="text-ink/50">None</span>}</td>
                <td className={td}>{sum.required > 0 ? <ProgressBar done={sum.completed} total={sum.required} /> : <span className="text-ink/50">No deliverables</span>}</td>
                <td className={td}><Last p={sum.website} /></td>
                <td className={td}><Last p={sum.linkedin} /></td>
                <td className={td}>{nextOf(sum) === '9999' ? <span className="text-ink/50">None</span> : formatDate(nextOf(sum))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

function nextOf(sum: SponsorSummary): string {
  return [sum.website.nextScheduled, sum.linkedin.nextScheduled].filter((x): x is string => !!x).sort()[0] ?? '9999';
}

function Last({ p }: { p: SponsorSummary['website'] }) {
  if (p.required === 0) return <span className="text-ink/50">Not in package</span>;
  if (!p.lastPublished) return <span className="text-ink/70">Never · {p.remaining} to go</span>;
  return (
    <div>
      <div>{formatDate(p.lastPublished)}</div>
      <div className="text-xs text-ink/60">{describeGap(p.daysSinceLast!)}{p.remaining ? ` · ${p.remaining} to go` : ' · done'}</div>
    </div>
  );
}
