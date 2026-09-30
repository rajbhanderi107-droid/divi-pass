import { describe, expect, it } from 'vitest';
import { loginEmail, parseAuthHash } from './index';

describe('sign-in helpers', () => {
  it('turns a login id into the address used behind the scenes', () => {
    expect(loginEmail(' Raj ')).toBe('raj@login.divipass.app');
    expect(loginEmail('someone@gmail.com')).toBe('someone@gmail.com');
  });
  it('reads the tokens Google sends back', () => {
    const r = parseAuthHash('#access_token=a1&refresh_token=r1&expires_in=3600&token_type=bearer');
    expect(r?.session?.access).toBe('a1'); expect(r?.session?.refresh).toBe('r1');
  });
  it('reads a sign-in error', () => {
    expect(parseAuthHash('#error=access_denied&error_description=Signups+not+allowed')?.error).toBe('Signups not allowed');
  });
  it('ignores normal app addresses', () => {
    expect(parseAuthHash('#/sales')).toBeNull(); expect(parseAuthHash('')).toBeNull();
  });
});
