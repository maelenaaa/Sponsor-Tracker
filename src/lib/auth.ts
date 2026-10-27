import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from './session';
import { UserError } from './validation';

export async function requireAuth(): Promise<void> {
  const ok = await verifySession(cookies().get(SESSION_COOKIE)?.value).catch(() => false);
  if (!ok) throw new UserError('Your session expired. Sign in again.');
}

export function passwordMatches(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
