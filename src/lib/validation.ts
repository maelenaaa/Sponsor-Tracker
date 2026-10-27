import { z } from 'zod';
import { isISODate } from './dates';
import {
  DELIVERABLE_STATUSES,
  PLATFORMS,
  RECURRENCES,
  SPONSOR_STATUSES,
} from './domain/types';

/** Form fields arrive as strings; empty strings mean "not provided". */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = (max = 2000) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional()).transform((v) => v ?? null);

const optionalUrl = z
  .preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(2000)
      .refine((v) => {
        try {
          const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
          return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
        } catch {
          return false;
        }
      }, 'Enter a valid web address, like https://example.com')
      .nullable()
      .optional(),
  )
  .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null));

const optionalEmail = z
  .preprocess(emptyToNull, z.string().trim().email('Enter a valid email address').max(320).nullable().optional())
  .transform((v) => v ?? null);

export const isoDate = z.string().refine(isISODate, 'Enter a valid date');
const optionalDate = z
  .preprocess(emptyToNull, isoDate.nullable().optional())
  .transform((v) => v ?? null);

const uuid = z.string().uuid();
const optionalUuid = z.preprocess(emptyToNull, uuid.nullable().optional()).transform((v) => v ?? null);

export const sponsorInput = z
  .object({
    name: z.string().trim().min(1, 'Sponsor name is required').max(200),
    contact_name: optionalText(200),
    email: optionalEmail,
    website_url: optionalUrl,
    linkedin_url: optionalUrl,
    package_id: optionalUuid,
    status: z.enum(SPONSOR_STATUSES).default('active'),
    start_date: optionalDate,
    end_date: optionalDate,
    notes: optionalText(5000),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: 'End date must be on or after the start date',
    path: ['end_date'],
  });
export type SponsorInput = z.infer<typeof sponsorInput>;

export const packageInput = z.object({
  name: z.string().trim().min(1, 'Package name is required').max(120),
  description: optionalText(1000),
  is_active: z.boolean().default(true),
});
export type PackageInput = z.infer<typeof packageInput>;

const int = (min: number, max: number, label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be ${max} or less`);

const optionalInt = (min: number, max: number, label: string) =>
  z.preprocess(emptyToNull, int(min, max, label).nullable().optional()).transform((v) => v ?? null);

export const packageItemInput = z
  .object({
    label: z.string().trim().min(1, 'Describe the deliverable').max(160),
    platform: z.enum(PLATFORMS),
    recurrence: z.enum(RECURRENCES),
    quantity: z.preprocess(emptyToNull, int(1, 100, 'Quantity').optional()).transform((v) => v ?? 1),
    interval_months: optionalInt(1, 24, 'Repeat interval'),
    start_offset_days: z
      .preprocess(emptyToNull, int(0, 3650, 'Start offset').optional())
      .transform((v) => v ?? 0),
    max_occurrences: optionalInt(1, 200, 'Maximum occurrences'),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.recurrence === 'recurring' && v.interval_months === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['interval_months'],
        message: 'Recurring deliverables need a repeat interval in months',
      });
    }
  })
  .transform((v) =>
    v.recurrence === 'one_time' ? { ...v, max_occurrences: null } : { ...v, quantity: 1 },
  );
export type PackageItemInput = z.infer<typeof packageItemInput>;

export const manualDeliverableInput = z.object({
  sponsor_id: uuid,
  label: z.string().trim().min(1, 'Describe the deliverable').max(160),
  platform: z.enum(PLATFORMS),
  planned_date: optionalDate,
  notes: optionalText(2000),
});
export type ManualDeliverableInput = z.infer<typeof manualDeliverableInput>;

export const publishInput = z.object({
  actual_date: isoDate,
  published_url: optionalUrl,
});
export type PublishInput = z.infer<typeof publishInput>;

export const deliverableEditInput = z.object({
  planned_date: optionalDate,
  published_url: optionalUrl,
  notes: optionalText(2000),
  status: z.enum(DELIVERABLE_STATUSES).optional(),
});
export type DeliverableEditInput = z.infer<typeof deliverableEditInput>;

/** Turns a zod error into one readable line per problem. */
export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join('. ');
}

export class UserError extends Error {}
