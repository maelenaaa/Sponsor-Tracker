import type { Q } from './services/common';
import { addItem, createPackage } from './services/packages';
import { packageInput, packageItemInput } from './validation';

/**
 * Two EXAMPLE packages so the app has something to work with on day one.
 * They are placeholders, not your real commitments. Edit them on the Packages page.
 */
export async function seedSamplePackages(q: Q) {
  const premier = await createPackage(
    q,
    packageInput.parse({
      name: 'Premier Sponsor',
      description: 'SAMPLE: replace these rules with your real Premier commitments.',
    }),
  );
  const monthly = await createPackage(
    q,
    packageInput.parse({
      name: 'Monthly $300 Sponsor',
      description: 'SAMPLE: replace these rules with your real monthly commitments.',
    }),
  );

  const premierItems = [
    { label: 'Website feature', platform: 'website', recurrence: 'one_time', quantity: 1 },
    { label: 'First feature on LinkedIn', platform: 'linkedin', recurrence: 'one_time', quantity: 1 },
    {
      label: 'LinkedIn feature (every other month)',
      platform: 'linkedin',
      recurrence: 'recurring',
      interval_months: 2,
      start_offset_days: 60,
    },
  ];
  const monthlyItems = [
    { label: 'Website feature', platform: 'website', recurrence: 'one_time', quantity: 1 },
    { label: 'Monthly LinkedIn post', platform: 'linkedin', recurrence: 'recurring', interval_months: 1 },
  ];
  for (const i of premierItems) await addItem(q, premier.id, packageItemInput.parse(i));
  for (const i of monthlyItems) await addItem(q, monthly.id, packageItemInput.parse(i));
  return { premier, monthly };
}
