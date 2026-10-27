import {
  correctPublishedAction,
  deleteManualAction,
  notesAction,
  publishAction,
  scheduleAction,
  setStatusAction,
  unpublishAction,
} from '@/app/actions';
import { STATUS_LABEL, type DeliverableRow } from '@/lib/domain/types';
import type { ISODate } from '@/lib/dates';
import { ActionForm, SubmitButton } from './ActionForm';
import { inputCls } from './ui';

type D = Pick<DeliverableRow, 'id' | 'status' | 'planned_date' | 'actual_date' | 'published_url' | 'notes' | 'source'>;

export function ScheduleForm({
  id,
  value,
  defaultDate,
  label = 'Schedule',
  accent = false,
}: {
  id: string;
  value?: ISODate | null;
  defaultDate?: ISODate;
  label?: string;
  accent?: boolean;
}) {
  return (
    <ActionForm action={scheduleAction} className="flex flex-wrap items-center gap-2" showSuccess={false}>
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`sched-${id}`}>Planned date</label>
      <input id={`sched-${id}`} type="date" name="planned_date" defaultValue={value ?? defaultDate ?? ''} className={`${inputCls} !w-auto`} />
      <SubmitButton variant={accent ? 'accent' : 'ghost'}>{label}</SubmitButton>
    </ActionForm>
  );
}

export function PublishPopover({ id, today }: { id: string; today: ISODate }) {
  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center bg-orange px-3.5 py-2 text-sm font-medium text-ink hover:bg-orange-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy">
        Publish
      </summary>
      <ActionForm action={publishAction} className="absolute left-0 z-10 mt-1 grid w-72 gap-2 border border-navy/30 bg-white p-3 shadow-md" showSuccess={false}>
        <input type="hidden" name="id" value={id} />
        <label className="text-xs font-medium">Published on
          <input type="date" name="actual_date" defaultValue={today} max={today} required className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs font-medium">Link to the post or page
          <input type="url" name="published_url" placeholder="https://" className={`${inputCls} mt-1`} />
        </label>
        <SubmitButton variant="accent" pendingText="Publishing…">Mark published</SubmitButton>
      </ActionForm>
    </details>
  );
}

/** Everything you can do to one deliverable, with Publish never more than two clicks away. */
export function DeliverableActions({ d, today }: { d: D; today: ISODate }) {
  if (d.status === 'published') {
    return (
      <div className="flex flex-wrap items-start gap-2">
        <details className="group">
          <summary className="cursor-pointer text-sm text-navy underline underline-offset-2">Edit date or link</summary>
          <ActionForm action={correctPublishedAction} className="mt-2 grid w-72 gap-2 border border-line bg-cream p-3">
            <input type="hidden" name="id" value={d.id} />
            <label className="text-xs font-medium">Published on
              <input type="date" name="actual_date" defaultValue={d.actual_date ?? today} max={today} required className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs font-medium">Link
              <input type="url" name="published_url" defaultValue={d.published_url ?? ''} placeholder="https://" className={`${inputCls} mt-1`} />
            </label>
            <SubmitButton>Save changes</SubmitButton>
          </ActionForm>
        </details>
        <ActionForm action={unpublishAction} showSuccess={false}>
          <input type="hidden" name="id" value={d.id} />
          <SubmitButton variant="link" confirm="Undo this publish? The date and link stay in the history.">Undo publish</SubmitButton>
        </ActionForm>
      </div>
    );
  }

  const waived = d.status === 'not_required';
  return (
    <div className="flex flex-wrap items-start gap-2">
      {!waived ? (
        <>
          <ScheduleForm id={d.id} value={d.planned_date} label={d.planned_date ? 'Move' : 'Schedule'} />
          <PublishPopover id={d.id} today={today} />
        </>
      ) : null}
      <details className="relative">
        <summary className="cursor-pointer list-none px-1 py-2 text-sm text-navy underline underline-offset-2">More</summary>
        <div className="absolute right-0 z-10 mt-1 grid w-72 gap-3 border border-line bg-white p-3 shadow-md">
          <ActionForm action={setStatusAction} className="flex items-end gap-2" showSuccess={false}>
            <input type="hidden" name="id" value={d.id} />
            <label className="flex-1 text-xs font-medium">Status
              <select name="status" defaultValue={d.status} className={`${inputCls} mt-1`}>
                {(['not_scheduled', 'scheduled', 'in_progress', 'not_required'] as const).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <SubmitButton variant="ghost">Set</SubmitButton>
          </ActionForm>
          <ActionForm action={notesAction} className="grid gap-2" showSuccess={false}>
            <input type="hidden" name="id" value={d.id} />
            <label className="text-xs font-medium">Notes
              <textarea name="notes" defaultValue={d.notes ?? ''} rows={3} className={`${inputCls} mt-1`} />
            </label>
            <SubmitButton variant="ghost">Save notes</SubmitButton>
          </ActionForm>
          {d.source === 'manual' ? (
            <ActionForm action={deleteManualAction} showSuccess={false}>
              <input type="hidden" name="id" value={d.id} />
              <SubmitButton variant="danger" confirm="Delete this deliverable?">Delete</SubmitButton>
            </ActionForm>
          ) : null}
        </div>
      </details>
    </div>
  );
}
