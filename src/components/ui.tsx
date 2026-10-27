import Link from 'next/link';
import type { ReactNode } from 'react';
import { daysOverdue, isOverdue } from '@/lib/domain/deliverables';
import {
  PLATFORM_LABEL,
  SPONSOR_STATUS_LABEL,
  STATUS_LABEL,
  type DeliverableRow,
  type Platform,
  type SponsorStatus,
} from '@/lib/domain/types';
import type { ISODate } from '@/lib/dates';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export const inputCls =
  'w-full border border-navy/25 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-navy focus:outline focus:outline-2 focus:outline-navy/30';
export const labelCls = 'mb-1 block text-sm font-medium text-ink';
export const btnLink =
  'inline-flex items-center justify-center px-3.5 py-2 text-sm font-medium border border-navy/30 text-navy hover:bg-navy-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy';

export function PageHeader({ title, children, sub }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-navy">{title}</h1>
        {sub ? <p className="mt-1 max-w-prose text-sm text-ink/70">{sub}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Section({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-8">
      <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
        <h2 className="font-display text-xl font-medium text-navy">{title}</h2>
        {aside ? <div className="text-sm text-ink/70">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="border border-dashed border-line bg-white/60 px-4 py-6 text-sm text-ink/70">{children}</p>;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className={labelCls}>{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink/60">{hint}</span> : null}
    </label>
  );
}

const TONE = {
  neutral: 'bg-cream-200 text-ink border-line',
  navy: 'bg-navy-100 text-navy border-navy/20',
  orange: 'bg-orange-100 text-orange-700 border-orange/40',
  ok: 'bg-[#e4f3ea] text-ok border-ok/30',
  late: 'bg-[#fbe5e3] text-late border-late/30',
} as const;

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return <span className={cx('inline-block whitespace-nowrap border px-2 py-0.5 text-xs font-medium', TONE[tone])}>{children}</span>;
}

export function StatusBadge({ d, today }: { d: Pick<DeliverableRow, 'status' | 'planned_date' | 'due_date'>; today: ISODate }) {
  if (isOverdue(d, today)) {
    const n = daysOverdue(d, today);
    return <Badge tone="late">Overdue {n} day{n === 1 ? '' : 's'}</Badge>;
  }
  const tone = d.status === 'published' ? 'ok' : d.status === 'scheduled' ? 'navy' : d.status === 'in_progress' ? 'orange' : 'neutral';
  return <Badge tone={tone}>{STATUS_LABEL[d.status]}</Badge>;
}

export function SponsorStatusBadge({ status }: { status: SponsorStatus }) {
  const tone = status === 'active' ? 'ok' : status === 'paused' ? 'orange' : 'neutral';
  return <Badge tone={tone}>{SPONSOR_STATUS_LABEL[status]}</Badge>;
}

export function PlatformTag({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        aria-hidden
        className={cx('inline-block h-2.5 w-2.5', platform === 'website' ? 'bg-navy' : platform === 'linkedin' ? 'bg-orange' : 'bg-ink/40')}
      />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

export function SponsorLink({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/sponsors/${id}`} className="font-medium text-navy underline-offset-2 hover:text-orange-700 hover:underline">
      {name}
    </Link>
  );
}

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-navy underline underline-offset-2 hover:text-orange-700">
      {children}
    </a>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2" title={`${done} of ${total} published`}>
      <div className="h-1.5 w-20 bg-line" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label="Published">
        <div className="h-full bg-navy" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm tabular-nums">{done}/{total}</span>
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto border border-line bg-white', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}
export const th = 'border-b border-line bg-cream-200 px-3 py-2 text-left text-xs font-semibold text-ink/80';
export const td = 'border-b border-line/70 px-3 py-2.5 align-top';
