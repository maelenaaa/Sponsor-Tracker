'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/planner', label: 'Weekly planner' },
  { href: '/sponsors', label: 'Sponsors' },
  { href: '/deliverables', label: 'Deliverables' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/packages', label: 'Packages' },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="-mb-px flex gap-1 overflow-x-auto">
      {LINKS.map((l) => {
        const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={
              'whitespace-nowrap border-b-[3px] px-3 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange ' +
              (active ? 'border-orange text-white' : 'border-transparent text-cream/75 hover:text-white')
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
