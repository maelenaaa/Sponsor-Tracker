import { config as loadEnv } from 'dotenv';
import { makeSql } from '../src/lib/db';
import { migrate } from '../src/lib/migrate';

loadEnv({ path: '.env.local' });
loadEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
    process.exit(1);
  }
  const sql = makeSql(url, { max: 1 });
  try {
    const ran = await migrate(sql);
    console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date.');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
