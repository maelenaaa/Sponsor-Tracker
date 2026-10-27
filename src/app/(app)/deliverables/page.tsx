import Link from 'next/link';
import { DeliverableTable } from '@/components/DeliverableTable';
import { PageHeader, btnLink, inputCls } from '@/components/ui';
import { isISODate } from '@/lib/dates';
import { getSql } from '@/lib/db';
import { DELIVERABLE_STATUSES, PLATFORMS, PLATFORM_LABEL, STATUS_LABEL, type DeliverableStatus, type Platform } from '@/lib/domain/types';
import { loadWorkspace } from '@/lib/load';
import { listDeliverables } from '@/lib/services/deliverables';
import { listPackages } from '@/lib/services/packages';

interface Params {
  q?: string; sponsor?: string; package?: string; platform?: string; status?: string;
  from?: string; to?: string; overdue?: string; outstanding?: string;
}

export default async function Deliverables({ searchParams: sp }: { searchParams: Params }) {
  const { today, sponsors } = await loadWorkspace();
  const sql = getSql();
  const packages = await listPackages(sql);
  const uuid = /^[0-9a-f-]{36}$/i;
  const rows = await listDeliverables(sql, {
    search: sp.q?.trim() || undefined,
    sponsorId: sp.sponsor && uuid.test(sp.sponsor) ? sp.sponsor : undefined,
    packageId: sp.package && uuid.test(sp.package) ? sp.package : undefined,
    platform: PLATFORMS.includes(sp.platform as Platform) ? (sp.platform as Platform) : undefined,
    status: DELIVERABLE_STATUSES.includes(sp.status as DeliverableStatus) ? (sp.status as DeliverableStatus) : undefined,
    from: sp.from && isISODate(sp.from) ? sp.from : undefined,
    to: sp.to && isISODate(sp.to) ? sp.to : undefined,
    overdueOn: sp.overdue ? today : undefined,
    outstanding: sp.outstanding ? true : undefined,
  });

  return (
    <>
      <PageHeader title="Deliverables" sub={`${rows.length} shown. Every deliverable for every sponsor, in one table.`} />
      <form method="get" className="mb-4 grid gap-3 border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label><span className="sr-only">Search</span><input name="q" defaultValue={sp.q ?? ''} placeholder="Search sponsor or deliverable" className={inputCls} /></label>
        <label><span className="sr-only">Sponsor</span>
          <select name="sponsor" defaultValue={sp.sponsor ?? ''} className={inputCls}>
            <option value="">All sponsors</option>
            {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Package</span>
          <select name="package" defaultValue={sp.package ?? ''} className={inputCls}>
            <option value="">All packages</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Platform</span>
          <select name="platform" defaultValue={sp.platform ?? ''} className={inputCls}>
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Status</span>
          <select name="status" defaultValue={sp.status ?? ''} className={inputCls}>
            <option value="">Any status</option>
            {DELIVERABLE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="text-xs">From<input type="date" name="from" defaultValue={sp.from ?? ''} className={`${inputCls} mt-1`} /></label>
        <label className="text-xs">To<input type="date" name="to" defaultValue={sp.to ?? ''} className={`${inputCls} mt-1`} /></label>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="overdue" value="1" defaultChecked={!!sp.overdue} /> Overdue only</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="outstanding" value="1" defaultChecked={!!sp.outstanding} /> Outstanding only</label>
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button className="bg-navy px-3.5 py-2 text-sm font-medium text-cream hover:bg-navy-900">Apply</button>
          <Link href="/deliverables" className={btnLink}>Clear</Link>
        </div>
      </form>
      <DeliverableTable rows={rows} today={today} empty="No deliverables match those filters." />
    </>
  );
}
