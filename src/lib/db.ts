import postgres from 'postgres';

export type Sql = postgres.Sql<any>;

/** Plain "YYYY-MM-DD" strings for date columns (no JS Date, so no time zone shifts). */
const types = {
  date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
};

/**
 * Vercel's Supabase integration gives connection strings that end in options such as
 * "?sslmode=require&supa=base-pooler.x". The database driver would forward unknown options like
 * "supa" to Postgres, which rejects them. Remove the options that are not needed.
 */
export function cleanConnectionString(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  try {
    const u = new URL(trimmed);
    for (const key of ['supa', 'sslmode', 'pgbouncer', 'pgbouncer_mode']) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return trimmed;
  }
}

/** DATABASE_URL, or the pooled URL Vercel's Supabase integration creates (POSTGRES_URL). */
export function databaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.DATABASE_URL || env.POSTGRES_URL;
  return raw ? cleanConnectionString(raw) : null;
}

export function makeSql(url: string, opts: { max?: number } = {}): Sql {
  url = cleanConnectionString(url);
  const local = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
  return postgres(url, {
    max: opts.max ?? 3,
    idle_timeout: 20,
    connect_timeout: 15,
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    ssl: local ? false : 'require',
    types,
    onnotice: () => {},
  });
}

const globalForDb = globalThis as unknown as { __sql?: Sql };

/** Shared connection for the running app. */
export function getSql(): Sql {
  if (!globalForDb.__sql) {
    const url = databaseUrlFromEnv();
    if (!url) throw new Error('DATABASE_URL is not set. Add it under Vercel > Settings > Environment Variables, then redeploy.');
    globalForDb.__sql = makeSql(url);
  }
  return globalForDb.__sql;
}
