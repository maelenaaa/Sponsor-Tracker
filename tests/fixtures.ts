import type { DeliverableRow, PackageItem, PackageRow, SponsorRow } from '@/lib/domain/types';

let n = 0;
const id = () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, '0')}`;

export function sponsor(over: Partial<SponsorRow> = {}): SponsorRow {
  return {
    id: id(), name: `Sponsor ${n}`, contact_name: null, email: null, website_url: null, linkedin_url: null,
    package_id: null, status: 'active', start_date: null, end_date: null, date_added: '2026-01-01',
    notes: null, snoozed_until: null, sync_signature: null, ...over,
  };
}

export function pkg(over: Partial<PackageRow> = {}): PackageRow {
  return { id: id(), name: `Package ${n}`, description: null, is_active: true, version: 1, ...over };
}

export function item(packageId: string, over: Partial<PackageItem> = {}): PackageItem {
  return {
    id: id(), package_id: packageId, label: 'Website feature', platform: 'website', recurrence: 'one_time',
    quantity: 1, interval_months: null, start_offset_days: 0, max_occurrences: null, notes: null,
    sort_order: 0, archived: false, ...over,
  };
}

export function deliverable(sponsorId: string, over: Partial<DeliverableRow> = {}): DeliverableRow {
  return {
    id: id(), sponsor_id: sponsorId, package_item_id: null, sequence_no: 1, source: 'manual', package_version: null,
    label: 'Website feature', platform: 'website', status: 'not_scheduled', due_date: null, planned_date: null,
    actual_date: null, published_url: null, notes: null, ...over,
  };
}
