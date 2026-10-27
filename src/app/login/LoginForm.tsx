'use client';

import { loginAction } from '@/app/actions';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { inputCls, labelCls } from '@/components/ui';

export function LoginForm({ next }: { next: string }) {
  return (
    <ActionForm action={loginAction} className="grid gap-4 border border-line bg-white p-5" showSuccess={false}>
      <input type="hidden" name="next" value={next} />
      <label>
        <span className={labelCls}>Password</span>
        <input type="password" name="password" required autoFocus autoComplete="current-password" className={inputCls} />
      </label>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </ActionForm>
  );
}
