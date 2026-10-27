import Link from 'next/link';
import { Badge, Empty, PageHeader, btnLink } from '@/components/ui';
import { getSql } from '@/lib/db';
import { describeItem } from '@/lib/domain/describe';
import { listPackages } from '@/lib/services/packages';

export default async function Packages() {
  const packages = await listPackages(getSql());
  return (
    <>
      <PageHeader title="Packages" sub="A package is a template. Adding a sponsor to a package creates its deliverables from these rules.">
        <Link href="/packages/new" className="inline-flex bg-navy px-3.5 py-2 text-sm font-medium text-cream hover:bg-navy-900">New package</Link>
      </PageHeader>
      {packages.length === 0 ? (
        <Empty>No packages yet. Create one, then add a rule for each thing the sponsor is owed.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {packages.map((p) => {
            const items = p.items.filter((i) => !i.archived);
            return (
              <article key={p.id} className="border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-xl text-navy">{p.name}</h2>
                  <div className="flex gap-2">
                    {!p.is_active ? <Badge>Inactive</Badge> : null}
                    <Badge tone="navy">{p.sponsor_count} sponsor{p.sponsor_count === 1 ? '' : 's'}</Badge>
                  </div>
                </div>
                {p.description ? <p className="mt-1 text-sm text-ink/70">{p.description}</p> : null}
                {items.length === 0 ? (
                  <p className="mt-3 text-sm text-ink/60">No rules yet.</p>
                ) : (
                  <ul className="mt-3 list-disc pl-5 text-sm">
                    {items.map((i) => <li key={i.id}>{describeItem(i)}</li>)}
                  </ul>
                )}
                <div className="mt-4"><Link href={`/packages/${p.id}`} className={btnLink}>Edit package</Link></div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
