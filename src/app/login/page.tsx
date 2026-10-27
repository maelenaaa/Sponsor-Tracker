import { LoginForm } from './LoginForm';

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl font-semibold text-navy">Sponsor desk</h1>
        <p className="mb-6 mt-1 text-sm text-ink/70">Sign in to see who to feature this week.</p>
        <LoginForm next={searchParams.next ?? ''} />
      </div>
    </div>
  );
}
