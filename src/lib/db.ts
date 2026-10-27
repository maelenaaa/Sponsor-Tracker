import postgres from 'postgres';

export type Sql = postgres.Sql<any>;

/** Plain "YYYY-MM-DD" strings for date columns (no JS Date, so no time zone shifts). */
const types = {
  date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
};

export function makeSql(url: string, opts: { max?: number } = {}): Sql {
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
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. See .env.example.');
    globalForDb.__sql = makeSql(url);
  }
  return globalForDb.__sql;
}
