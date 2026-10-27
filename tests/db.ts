import path from 'node:path';
import { makeSql, type Sql } from '@/lib/db';
import { migrate } from '@/lib/migrate';

export const TEST_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/sponsor_test';

export async function setupDb(): Promise<Sql> {
  const sql = makeSql(TEST_URL, { max: 8 });
  await migrate(sql, path.join(process.cwd(), 'db', 'migrations'));
  return sql;
}

export async function resetDb(sql: Sql) {
  await sql`truncate deliverable_events, deliverables, sponsors, package_items, packages restart identity cascade`;
}
