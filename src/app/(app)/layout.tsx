import Link from 'next/link';
import { logoutAction } from '@/app/actions';
import { NavLinks } from '@/components/NavLinks';

export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b-[3px] border-orange bg-navy text-cream">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 px-4 pt-3">
          <Link href="/" className="font-display text-2xl font-medium tracking-tight text-white">
            Sponsor desk
          </Link>
          <form action={logoutAction}>
            <button className="text-sm text-cream/75 underline underline-offset-2 hover:text-white">Sign out</button>
          </form>
          <div className="order-last w-full"><NavLinks /></div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
