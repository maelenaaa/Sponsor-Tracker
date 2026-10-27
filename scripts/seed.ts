import { config as loadEnv } from 'dotenv';
import { config as appConfig } from '../src/lib/config';
import { addDays } from '../src/lib/dates';
import { makeSql } from '../src/lib/db';
import { migrate } from '../src/lib/migrate';
import { seedSamplePackages } from '../src/lib/samples';
import { listDeliverables, publishDeliverable, scheduleDeliverable } from '../src/lib/services/deliverables';
import { listPackages } from '../src/lib/services/packages';
import { createSponsor } from '../src/lib/services/sponsors';
import { sponsorInput } from '../src/lib/validation';

loadEnv({ path: '.env.local' });
loadEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  const packagesOnly = process.argv.includes('--packages-only');
  const sql = makeSql(url, { max: 1 });
  try {
    await migrate(sql);
    let packages = await listPackages(sql);
    if (packages.length === 0) {
      await seedSamplePackages(sql);
      packages = await listPackages(sql);
      console.log('Added two example packages (Premier Sponsor and Monthly $300 Sponsor). Edit them in the app.');
    } else if (packagesOnly) {
      console.log('Packages already exist. Nothing to do.');
    }
    if (packagesOnly) return;

    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from sponsors`;
    if (n > 0) {
      console.log(`The database already has ${n} sponsor(s). Sample sponsors were not added.`);
      return;
    }

    const today = appConfig.today();
    const opts = { today, horizonDays: appConfig.generationHorizonDays };
    const premier = packages.find((p) => p.name === 'Premier Sponsor');
    const monthly = packages.find((p) => p.name === 'Monthly $300 Sponsor');
    if (!premier || !monthly) throw new Error('Run the seed on a fresh database, or add sponsors in the app.');

    const make = (name: string, packageId: string, startDaysAgo: number, extra: Record<string, unknown> = {}) =>
      createSponsor(
        sql,
        sponsorInput.parse({
          name: `${name} (sample)`,
          package_id: packageId,
          start_date: addDays(today, -startDaysAgo),
          contact_name: 'Sample Contact',
          email: 'contact@example.com',
          website_url: 'https://example.com',
          ...extra,
        }),
        opts,
      );
    const publish = async (sponsorId: string, label: string, daysAgo: number, link: string) => {
      const rows = await listDeliverables(sql, { sponsorId });
      const d = rows.find((r) => r.label === label);
      if (!d) throw new Error(`Seed: ${label} not found`);
      await publishDeliverable(sql, d.id, { actual_date: addDays(today, -daysAgo), published_url: link }, today);
    };

    // 1. Featured everywhere a while ago; its next LinkedIn post is overdue.
    const northwind = await make('Northwind Benefits', premier.id, 75);
    await publish(northwind.id, 'Website feature', 55, 'https://example.com/sponsors/northwind');
    await publish(northwind.id, 'First feature on LinkedIn', 55, 'https://www.linkedin.com/posts/example-northwind');

    // 2. Nothing published yet, website feature overdue.
    await make('Harbor Light Bank', premier.id, 25);

    // 3. Website feature scheduled for later this week.
    const pine = await make('Pine and Ash Law', premier.id, 12);
    const pineWeb = (await listDeliverables(sql, { sponsorId: pine.id, platform: 'website' }))[0];
    await scheduleDeliverable(sql, pineWeb.id, addDays(today, 3));

    // 4. Monthly sponsor with some history.
    const lakeside = await make('Lakeside Accounting', monthly.id, 100);
    await publish(lakeside.id, 'Website feature', 90, 'https://example.com/sponsors/lakeside');
    await publish(lakeside.id, 'Monthly LinkedIn post #1', 90, 'https://www.linkedin.com/posts/example-lakeside-1');
    await publish(lakeside.id, 'Monthly LinkedIn post #2', 60, 'https://www.linkedin.com/posts/example-lakeside-2');

    // 5. New monthly sponsor, never featured.
    await make('BrightPath Staffing', monthly.id, 8);

    // 6. Paused sponsor: kept on record but out of the recommendations.
    await make('Old Mill Coffee', monthly.id, 200, { status: 'paused' });

    console.log('Added six sample sponsors with realistic history. Delete them from each sponsor page when you are ready for real data.');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
