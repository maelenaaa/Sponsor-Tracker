'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { idle, type ActionState } from '@/lib/action-state';

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  showSuccess = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
}) {
  const [state, formAction] = useFormState(action, idle);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error ? (
        <p role="alert" className="mt-2 w-full text-sm font-medium text-late">
          {state.error}
        </p>
      ) : null}
      {state.ok && showSuccess && state.message ? (
        <p role="status" className="mt-2 w-full text-sm text-ok">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

const base =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:cursor-wait disabled:opacity-60';
const variants = {
  primary: 'bg-navy text-cream hover:bg-navy-900',
  accent: 'bg-orange text-ink hover:bg-orange-700 hover:text-white',
  ghost: 'border border-navy/30 text-navy hover:bg-navy-100',
  danger: 'border border-late/40 text-late hover:bg-late hover:text-white',
  link: 'px-0 py-0 text-navy underline underline-offset-2 hover:text-orange-700',
} as const;

export function SubmitButton({
  children,
  variant = 'primary',
  pendingText,
  className = '',
  confirm,
}: {
  children: ReactNode;
  variant?: keyof typeof variants;
  pendingText?: string;
  className?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${base} ${variants[variant]} ${className}`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText ?? 'Saving…' : children}
    </button>
  );
}
