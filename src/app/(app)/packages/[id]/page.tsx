import { notFound } from 'next/navigation';
import { z } from 'zod';
import { deletePackageAction, updatePackageAction } from '@/app/actions';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { ArchiveItemForm, PackageItemForm } from '@/components/PackageItemForm';
import { Badge, Field, PageHeader, Section, inputCls } from '@/components/ui';
import { getSql } from '@/lib/db';
import { describeItem } from '@/lib/domain/describe';
import { getPackage } from '@/lib/services/packages';

export default async function PackagePage({ params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const pkg = await getPackage(getSql(), params.id);
  if (!pkg) notFound();
  const active = pkg.items.filter((i) => !i.archived);
  const archived = pkg.items.filter((i) => i.archived);

  return (
    <>
      <PageHeader title={pkg.name} sub={`Version ${pkg.version}. ${pkg.sponsor_count} sponsor${pkg.sponsor_count === 1 ? '' : 's'} use this package.`} />

      <div className="mb-8 border-l-8 border-navy bg-navy-100 px-5 py-3 text-sm">
        Changing a rule here never rewrites history. Sponsors already on this package will show a
        <strong> Review package changes</strong> notice. You choose when to apply it, and published work is never touched.
      </div>

      <Section title="Package details">
        <ActionForm action={updatePackageAction} className="grid max-w-xl gap-4 border border-line bg-white p-5">
          <input type="hidden" name="id" value={pkg.id} />
          <Field label="Name"><input name="name" required defaultValue={pkg.name} className={inputCls} /></Field>
          <Field label="Description"><textarea name="description" rows={2} defaultValue={pkg.description ?? ''} className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={pkg.is_active} /> Available when adding sponsors</label>
          <div><SubmitButton>Save details</SubmitButton></div>
        </ActionForm>
      </Section>

      <Section title="Deliverable rules" aside={`${active.length} active`}>
        <div className="grid gap-4">
          {active.map((i) => (
            <details key={i.id} className="border border-line bg-white">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>{describeItem(i)}</span>
                <span className="text-navy underline underline-offset-2">Edit</span>
              </summary>
              <div className="grid gap-4 border-t border-line p-4">
                <PackageItemForm packageId={pkg.id} item={i} />
                <div><ArchiveItemForm item={i} /></div>
              </div>
            </details>
          ))}
          {active.length === 0 ? <p className="text-sm text-ink/70">No rules yet. Add the first one below.</p> : null}
        </div>
        <div className="mt-6 border border-line bg-white p-4">
          <h3 className="mb-3 font-medium">Add a rule</h3>
          <PackageItemForm packageId={pkg.id} />
        </div>
      </Section>

      {archived.length > 0 ? (
        <Section title="Archived rules" aside="Kept so history still makes sense">
          <ul className="grid gap-2">
            {archived.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-white px-4 py-2 text-sm">
                <span>{describeItem(i)} <Badge>Archived</Badge></span>
                <ArchiveItemForm item={i} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Delete package">
        <div className="max-w-xl border border-line bg-white p-5">
          <p className="mb-3 text-sm text-ink/70">Only possible when no sponsor uses it. To retire a package, untick “Available when adding sponsors” instead.</p>
          <ActionForm action={deletePackageAction}>
            <input type="hidden" name="id" value={pkg.id} />
            <SubmitButton variant="danger" confirm={`Delete the ${pkg.name} package?`}>Delete package</SubmitButton>
          </ActionForm>
        </div>
      </Section>
    </>
  );
}
