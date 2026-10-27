import { addItemAction, archiveItemAction, updateItemAction } from '@/app/actions';
import { PLATFORMS, PLATFORM_LABEL, RECURRENCES, type PackageItem } from '@/lib/domain/types';
import { ActionForm, SubmitButton } from './ActionForm';
import { Field, inputCls } from './ui';

const RECURRENCE_LABEL = { one_time: 'One time', recurring: 'Repeats' } as const;

export function PackageItemForm({ packageId, item }: { packageId: string; item?: PackageItem }) {
  const editing = !!item;
  return (
    <ActionForm action={editing ? updateItemAction : addItemAction} className="grid gap-3 md:grid-cols-6" resetOnSuccess={!editing}>
      {item ? <input type="hidden" name="item_id" value={item.id} /> : <input type="hidden" name="package_id" value={packageId} />}
      <Field label="Deliverable" className="md:col-span-3">
        <input name="label" required defaultValue={item?.label} placeholder="Website feature" className={inputCls} />
      </Field>
      <Field label="Where" className="md:col-span-1">
        <select name="platform" defaultValue={item?.platform ?? 'website'} className={inputCls}>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </select>
      </Field>
      <Field label="One time or repeats" className="md:col-span-2">
        <select name="recurrence" defaultValue={item?.recurrence ?? 'one_time'} className={inputCls}>
          {RECURRENCES.map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
        </select>
      </Field>
      <Field label="How many" hint="One time only" className="md:col-span-1">
        <input type="number" name="quantity" min={1} max={100} defaultValue={item?.quantity ?? 1} className={inputCls} />
      </Field>
      <Field label="Every N months" hint="Required if it repeats" className="md:col-span-1">
        <input type="number" name="interval_months" min={1} max={24} defaultValue={item?.interval_months ?? ''} className={inputCls} />
      </Field>
      <Field label="First due after (days)" hint="From the start date" className="md:col-span-2">
        <input type="number" name="start_offset_days" min={0} max={3650} defaultValue={item?.start_offset_days ?? 0} className={inputCls} />
      </Field>
      <Field label="Stop after (times)" hint="Repeats only. Blank = until the sponsorship ends" className="md:col-span-2">
        <input type="number" name="max_occurrences" min={1} max={200} defaultValue={item?.max_occurrences ?? ''} className={inputCls} />
      </Field>
      <Field label="Notes" className="md:col-span-6">
        <input name="notes" defaultValue={item?.notes ?? ''} className={inputCls} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 md:col-span-6">
        <SubmitButton>{editing ? 'Save rule' : 'Add rule'}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ArchiveItemForm({ item }: { item: PackageItem }) {
  return (
    <ActionForm action={archiveItemAction} showSuccess={false}>
      <input type="hidden" name="item_id" value={item.id} />
      <input type="hidden" name="archived" value={item.archived ? 'false' : 'true'} />
      <SubmitButton
        variant={item.archived ? 'ghost' : 'danger'}
        confirm={item.archived ? undefined : 'Archive this rule? Sponsors will be offered the change to review. Published history is kept.'}
      >
        {item.archived ? 'Restore rule' : 'Archive rule'}
      </SubmitButton>
    </ActionForm>
  );
}
