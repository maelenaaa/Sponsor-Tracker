import type { ISODate } from '../dates';

export const PLATFORMS = ['website', 'linkedin', 'other'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const DELIVERABLE_STATUSES = [
  'not_scheduled',
  'scheduled',
  'in_progress',
  'published',
  'not_required',
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const SPONSOR_STATUSES = ['active', 'completed', 'paused', 'inactive'] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

export const RECURRENCES = ['one_time', 'recurring'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const STATUS_LABEL: Record<DeliverableStatus, string> = {
  not_scheduled: 'Not scheduled',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  published: 'Published',
  not_required: 'Not required',
};

export const SPONSOR_STATUS_LABEL: Record<SponsorStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  paused: 'Paused',
  inactive: 'Inactive',
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  other: 'Other',
};

export interface PackageItem {
  id: string;
  package_id: string;
  label: string;
  platform: Platform;
  recurrence: Recurrence;
  quantity: number;
  interval_months: number | null;
  start_offset_days: number;
  max_occurrences: number | null;
  notes: string | null;
  sort_order: number;
  archived: boolean;
}

export interface PackageRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  version: number;
}

export interface SponsorRow {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  package_id: string | null;
  status: SponsorStatus;
  start_date: ISODate | null;
  end_date: ISODate | null;
  date_added: ISODate;
  notes: string | null;
  snoozed_until: ISODate | null;
  sync_signature: string | null;
}

export interface DeliverableRow {
  id: string;
  sponsor_id: string;
  package_item_id: string | null;
  sequence_no: number;
  source: 'generated' | 'manual';
  package_version: number | null;
  label: string;
  platform: Platform;
  status: DeliverableStatus;
  due_date: ISODate | null;
  planned_date: ISODate | null;
  actual_date: ISODate | null;
  published_url: string | null;
  notes: string | null;
}

/** A deliverable that still needs work (not published, not waived). */
export const OPEN_STATUSES: DeliverableStatus[] = ['not_scheduled', 'scheduled', 'in_progress'];
