import { PLATFORM_LABEL, type PackageItem } from './types';

/** Plain-language summary of one package rule, shown wherever rules are listed. */
export function describeItem(i: Pick<PackageItem, 'label' | 'platform' | 'recurrence' | 'quantity' | 'interval_months' | 'start_offset_days' | 'max_occurrences'>): string {
  const start =
    i.start_offset_days === 0 ? 'due on the sponsor’s start date' : `first due ${i.start_offset_days} days after the start date`;
  if (i.recurrence === 'recurring') {
    const every = i.interval_months === 1 ? 'every month' : `every ${i.interval_months} months`;
    const limit = i.max_occurrences ? `, ${i.max_occurrences} in total` : ', until the sponsorship ends';
    return `${PLATFORM_LABEL[i.platform]}: ${i.label}, ${every}, ${start}${limit}`;
  }
  const spacing = i.quantity > 1 && i.interval_months ? `, ${i.interval_months} month${i.interval_months === 1 ? '' : 's'} apart` : '';
  return `${PLATFORM_LABEL[i.platform]}: ${i.quantity} × ${i.label}${spacing}, ${start}`;
}
