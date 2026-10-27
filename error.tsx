'use client';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-2xl border-l-8 border-late bg-white px-6 py-5">
      <h1 className="font-display text-2xl text-navy">This page could not load</h1>
      <p className="mt-2 text-sm">
        The most common cause is the database connection. Check that <code>DATABASE_URL</code> is set in Vercel
        (Settings, Environment Variables), that the tables were created, and that you redeployed after changing
        a setting.
      </p>
      <p className="mt-2 text-sm text-ink/70">
        To see the exact reason, open the project in Vercel, go to Logs, and search for this code:{' '}
        <strong>{error.digest ?? 'none'}</strong>
      </p>
      <button onClick={reset} className="mt-4 bg-navy px-3.5 py-2 text-sm font-medium text-cream hover:bg-navy-900">
        Try again
      </button>
    </div>
  );
}
