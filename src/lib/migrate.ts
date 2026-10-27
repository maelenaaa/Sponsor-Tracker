import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Sql } from './db';

/** Applies every file in db/migrations that has not been applied yet. */
export async function migrate(sql: Sql, dir = path.join(process.cwd(), 'db', 'migrations')): Promise<string[]> {
  await sql`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;
  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name as string));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const text = readFileSync(path.join(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    ran.push(file);
  }
  return ran;
}
