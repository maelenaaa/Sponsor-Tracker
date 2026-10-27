'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ZodError, z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { passwordMatches, requireAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { addDays, isISODate, weekStart } from '@/lib/dates';
import { getSql } from '@/lib/db';
import { DELIVERABLE_STATUSES } from '@/lib/domain/types';
import {
  correctPublished,
  createManualDeliverable,
  deleteManualDeliverable,
  editDeliverableNotes,
  publishDeliverable,
  scheduleDeliverable,
  setDeliverableStatus,
  unpublishDeliverable,
} from '@/lib/services/deliverables';
import {
  addItem,
  createPackage,
  deletePackage,
  setItemArchived,
  updateItem,
  updatePackage,
} from '@/lib/services/packages';
import {
  createSponsor,
  deleteSponsor,
  setSnoozedUntil,
  updateSponsor,
} from '@/lib/services/sponsors';
import { applySync } from '@/lib/services/sync';
import { SESSION_COOKIE, sessionMaxAge, signSession } from '@/lib/session';
import {
  UserError,
  formatZodError,
  manualDeliverableInput,
  packageInput,
  packageItemInput,
  publishInput,
  sponsorInput,
} from '@/lib/validation';

type Fields = Record<string, string>;
const fields = (fd: FormData): Fields =>
  Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Fields;

const uuid = z.string().uuid();
const syncOpts = () => ({ today: config.today(), horizonDays: config.generationHorizonDays });

interface Outcome {
  message?: string;
  redirectTo?: string;
}

/** Runs one mutation: checks sign-in, turns errors into messages, refreshes the pages. */
async function run(fn: () => Promise<Outcome | void>): Promise<ActionState> {
  let outcome: Outcome | void;
  try {
    await requireAuth();
    outcome = await fn();
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: formatZodError(e) };
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: 'Something went wrong. Nothing was saved. Try again in a moment.' };
  }
  revalidatePath('/', 'layout');
  if (outcome && outcome.redirectTo) redirect(outcome.redirectTo);
  return { ok: true, message: (outcome && outcome.message) || 'Saved' };
}

// ---------------------------------------------------------------- sign in/out

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return {
      ok: false,
      error: 'The app is not set up yet. Add APP_PASSWORD and SESSION_SECRET (32+ characters) in your environment variables.',
    };
  }
  const password = String(formData.get('password') ?? '');
  if (!passwordMatches(password)) {
    await new Promise((r) => setTimeout(r, 600));
    return { ok: false, error: 'That password is not right.' };
  }
  cookies().set(SESSION_COOKIE, await signSession(), {
    httpOnly: true,
    // Secure cookies only travel over https. Vercel always serves https; local http still works.
    secure: headers().get('x-forwarded-proto') === 'https',
    sameSite: 'lax',
    path: '/',
    maxAge: sessionMaxAge,
  });
  const next = String(formData.get('next') ?? '');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function logoutAction() {
  cookies().delete(SESSION_COOKIE);
  redirect('/login');
}

// ------------------------------------------------------------------- sponsors

export async function createSponsorAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const input = sponsorInput.parse(fields(fd));
    const sponsor = await createSponsor(getSql(), input, syncOpts());
    return { redirectTo: `/sponsors/${sponsor.id}` };
  });
}

export async function updateSponsorAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    const id = uuid.parse(f.id);
    await updateSponsor(getSql(), id, sponsorInput.parse(f));
    return { message: 'Sponsor saved' };
  });
}

export async function deleteSponsorAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    await deleteSponsor(getSql(), uuid.parse(fields(fd).id));
    return { redirectTo: '/sponsors' };
  });
}

export async function snoozeSponsorAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    const id = uuid.parse(f.sponsor_id);
    const clear = f.clear === 'true';
    const until = clear ? null : addDays(weekStart(config.today()), 7);
    await setSnoozedUntil(getSql(), id, until);
    return { message: clear ? 'Back in the queue' : 'Skipped until next week' };
  });
}

export async function applySyncAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const id = uuid.parse(fields(fd).sponsor_id);
    const r = await applySync(getSql(), id, syncOpts(), 'full');
    const parts = [
      r.created && `${r.created} added`,
      r.retired && `${r.retired} marked not required`,
      r.dueUpdated && `${r.dueUpdated} due date${r.dueUpdated === 1 ? '' : 's'} updated`,
    ].filter(Boolean);
    return { message: parts.length ? `Applied: ${parts.join(', ')}` : 'Already up to date' };
  });
}

// --------------------------------------------------------------- deliverables

export async function scheduleAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    const id = uuid.parse(f.id);
    const date = f.planned_date?.trim() ? f.planned_date.trim() : null;
    if (date && !isISODate(date)) throw new UserError('Enter a valid date.');
    await scheduleDeliverable(getSql(), id, date);
    return { message: date ? 'Scheduled' : 'Schedule cleared' };
  });
}

export async function publishAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    const id = uuid.parse(f.id);
    const input = publishInput.parse({ actual_date: f.actual_date, published_url: f.published_url });
    await publishDeliverable(getSql(), id, input, config.today());
    return { message: 'Published' };
  });
}

export async function correctPublishedAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    const id = uuid.parse(f.id);
    const input = publishInput.parse({ actual_date: f.actual_date, published_url: f.published_url });
    await correctPublished(getSql(), id, input, config.today());
    return { message: 'Publication details updated' };
  });
}

export async function unpublishAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    await unpublishDeliverable(getSql(), uuid.parse(fields(fd).id));
    return { message: 'Publish undone' };
  });
}

export async function setStatusAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    const id = uuid.parse(f.id);
    const status = z.enum(DELIVERABLE_STATUSES).parse(f.status);
    await setDeliverableStatus(getSql(), id, status);
    return { message: 'Status updated' };
  });
}

export async function notesAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    const id = uuid.parse(f.id);
    const notes = f.notes?.trim() ? f.notes.trim().slice(0, 2000) : null;
    await editDeliverableNotes(getSql(), id, { notes });
    return { message: 'Notes saved' };
  });
}

export async function createManualAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const input = manualDeliverableInput.parse(fields(fd));
    await createManualDeliverable(getSql(), input);
    return { message: 'Deliverable added' };
  });
}

export async function deleteManualAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    await deleteManualDeliverable(getSql(), uuid.parse(fields(fd).id));
    return { message: 'Deleted' };
  });
}

// ------------------------------------------------------------------- packages

export async function createPackageAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    const input = packageInput.parse({ name: f.name, description: f.description, is_active: true });
    const pkg = await createPackage(getSql(), input);
    return { redirectTo: `/packages/${pkg.id}` };
  });
}

export async function updatePackageAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    const id = uuid.parse(f.id);
    const input = packageInput.parse({
      name: f.name,
      description: f.description,
      is_active: fd.get('is_active') === 'on',
    });
    await updatePackage(getSql(), id, input);
    return { message: 'Package saved' };
  });
}

export async function deletePackageAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    await deletePackage(getSql(), uuid.parse(fields(fd).id));
    return { redirectTo: '/packages' };
  });
}

export async function addItemAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    const packageId = uuid.parse(f.package_id);
    await addItem(getSql(), packageId, packageItemInput.parse(f));
    return { message: 'Rule added. Review changes on the sponsors that use this package.' };
  });
}

export async function updateItemAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    await updateItem(getSql(), uuid.parse(f.item_id), packageItemInput.parse(f));
    return { message: 'Rule saved. Review changes on the sponsors that use this package.' };
  });
}

export async function archiveItemAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const f = fields(fd);
    await setItemArchived(getSql(), uuid.parse(f.item_id), f.archived === 'true');
    return { message: f.archived === 'true' ? 'Rule archived' : 'Rule restored' };
  });
}
