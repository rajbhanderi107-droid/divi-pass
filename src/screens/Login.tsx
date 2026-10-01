import { useState } from 'react';
import { AuthError, signIn, signInWithGoogle } from '../auth';
import { Btn, Field, inputCls } from '../components/ui';
import { Leaves } from '../components/Leaves';

export function Login({ message }: { message?: string }) {
  const [id, setId] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(message ?? ''); const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    setErr(''); setBusy(true);
    try { await signIn(id, pw); }
    catch (x) { setErr(x instanceof AuthError && x.kind === 'offline' ? 'No internet. Connect once to sign in.' : x instanceof Error ? x.message : 'Could not sign in'); setBusy(false); }
  }
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 pb-8 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="surface surface-hero relative overflow-hidden p-5">
        <Leaves className="pointer-events-none absolute -right-3 -top-2 h-40 w-44 opacity-95" />
        <div className="relative max-w-[62%] space-y-1">
          <div className="text-xs font-bold uppercase tracking-[.14em] text-sand/80">Divya Achariya Divi</div>
          <h1 className="text-3xl font-extrabold leading-tight text-cream">Divi Pass</h1>
          <p className="text-sm text-cream/85">Sign in to open your register</p>
        </div>
      </div>
      <form onSubmit={go} className="space-y-3">
        <Field label="Login id (or your email)"><input className={inputCls} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={id} onChange={(e) => setId(e.target.value)} /></Field>
        <Field label="Password"><input className={inputCls} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
        <Btn type="submit" className="w-full" disabled={busy || !id.trim() || !pw}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
      </form>
      <div className="flex items-center gap-3 text-xs text-zinc-500"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
      <Btn kind="ghost" className="flex w-full items-center justify-center gap-2" onClick={async () => { setErr(''); try { await signInWithGoogle(); } catch (x) { setErr(x instanceof Error ? x.message : 'Could not start Google sign-in'); } }}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.5-5.8c-2.1 1.4-4.8 2.3-8.1 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
        Sign in with Google
      </Btn>
      <p className="text-center text-xs text-zinc-500">Logins are created by Raj or Dev. Google sign-in works for emails they have added.</p>
    </main>
  );
}
