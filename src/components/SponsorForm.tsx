import { createSponsorAction, updateSponsorAction } from '@/app/actions';
import { describeItem } from '@/lib/domain/describe';
import { SPONSOR_STATUSES, SPONSOR_STATUS_LABEL, type SponsorRow } from '@/lib/domain/types';
import type { PackageWithItems } from '@/lib/services/packages';
import { ActionForm, SubmitButton } from './ActionForm';
import { Field, inputCls } from './ui';

export function SponsorForm({
  sponsor,
  packages,
}: {
  sponsor?: SponsorRow;
  packages: PackageWithItems[];
}) {
  const editing = !!sponsor;
  const options = packages.filter((p) => p.is_active || p.id === sponsor?.package_id);
  return (
    <ActionForm action={editing ? updateSponsorAction : createSponsorAction} className="grid gap-5" showSuccess={editing}>
      {sponsor ? <input type="hidden" name="id" value={sponsor.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Sponsor or business name" className="md:col-span-2">
          <input name="name" required defaultValue={sponsor?.name} autoFocus={!editing} className={inputCls} />
        </Field>
        <Field label="Package" hint={editing ? 'Changing the package does not change any deliverables until you review and apply the changes.' : 'The package decides which deliverables are created.'}>
          <select name="package_id" defaultValue={sponsor?.package_id ?? ''} className={inputCls}>
            <option value="">No package yet</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.is_active ? '' : ' (inactive)'}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={sponsor?.status ?? 'active'} className={inputCls}>
            {SPONSOR_STATUSES.map((s) => <option key={s} value={s}>{SPONSOR_STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Contact person"><input name="contact_name" defaultValue={sponsor?.contact_name ?? ''} className={inputCls} /></Field>
        <Field label="Email"><input type="email" name="email" defaultValue={sponsor?.email ?? ''} className={inputCls} /></Field>
        <Field label="Website"><input name="website_url" defaultValue={sponsor?.website_url ?? ''} placeholder="example.com" className={inputCls} /></Field>
        <Field label="LinkedIn page or profile"><input name="linkedin_url" defaultValue={sponsor?.linkedin_url ?? ''} placeholder="linkedin.com/company/…" className={inputCls} /></Field>
        <Field label="Sponsorship starts" hint="Due dates count from here. Leave blank to use today.">
          <input type="date" name="start_date" defaultValue={sponsor?.start_date ?? ''} className={inputCls} />
        </Field>
        <Field label="Sponsorship ends" hint="Leave blank if it has no end date.">
          <input type="date" name="end_date" defaultValue={sponsor?.end_date ?? ''} className={inputCls} />
        </Field>
        <Field label="Notes" className="md:col-span-2">
          <textarea name="notes" rows={3} defaultValue={sponsor?.notes ?? ''} className={inputCls} />
        </Field>
      </div>
      {packages.length > 0 ? (
        <details className="border border-line bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-navy">What each package creates</summary>
          <div className="mt-3 grid gap-3">
            {packages.map((p) => (
              <div key={p.id}>
                <p className="font-medium">{p.name}</p>
                <ul className="list-disc pl-5 text-ink/80">
                  {p.items.filter((i) => !i.archived).map((i) => <li key={i.id}>{describeItem(i)}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <div><SubmitButton>{editing ? 'Save sponsor' : 'Add sponsor'}</SubmitButton></div>
    </ActionForm>
  );
}
