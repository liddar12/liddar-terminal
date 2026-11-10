import { useEffect, useState } from 'react';
import { authenticatedFetch, clearLocalSession, getAuthClient } from './auth.js';

const INPUT = 'mt-1 w-full rounded border border-term-grid bg-term-bg px-3 py-2 text-sm text-term-fg focus:border-term-accent focus:outline-none';
const BUTTON = 'rounded bg-term-accent px-4 py-2 text-sm font-semibold text-term-bg disabled:opacity-50';

export default function AuthGate({ children }) {
  const client = getAuthClient();
  const [session, setSession] = useState(undefined);
  const [verified, setVerified] = useState(null);
  const [phase, setPhase] = useState('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!client) return;
    // Do not await other Auth methods inside this callback (SDK lock).
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    let current = true;
    setVerified(null);
    if (session === undefined) return;
    if (!session) { setPhase('login'); return; }
    setPhase('checking');
    authenticatedFetch('/api/session').then(async (response) => {
      const body = await response.json();
      if (!current) return;
      if (response.ok && body.user?.id) {
        setVerified({ token: session.access_token, user: body.user });
        setPhase('ready');
        setError('');
      } else {
        setPhase(response.status === 403 ? 'denied' : response.status === 401 ? 'expired' : 'unavailable');
        setError(body.error || 'Sign-in verification is unavailable.');
      }
    }).catch(() => {
      if (current) { setPhase('unavailable'); setError('Sign-in verification is unavailable.'); }
    });
    return () => { current = false; };
  }, [session?.access_token, session === undefined, retry]);

  useEffect(() => {
    const expired = (event) => {
      if (event.detail === session?.access_token) {
        setVerified(null);
        setPhase('expired');
        setError('Your session has expired. Sign in again.');
      }
    };
    window.addEventListener('terminal-session-expired', expired);
    return () => window.removeEventListener('terminal-session-expired', expired);
  }, [session?.access_token]);

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) setError('Sign-in failed. Check your email and password.');
    } catch { setError('Sign-in is temporarily unavailable. Try again.'); }
    finally { setPassword(''); setBusy(false); }
  }

  async function signOut() {
    // Revoke this session upstream when available; local state is always locked.
    setBusy(true);
    setVerified(null);
    try { await client.auth.signOut({ scope: 'local' }); }
    catch { /* Always clear this tab even when remote revocation is unavailable. */ }
    finally {
      clearLocalSession();
      setSession(null); setPhase('login'); setError(''); setPassword(''); setBusy(false);
    }
  }

  if (phase === 'ready' && verified?.token === session?.access_token) {
    return <>
      <div className="mx-auto flex max-w-5xl items-center justify-end gap-3 px-4 pt-3 text-xs text-term-muted">
        <span>{verified.user.email || 'Owner session'}</span>
        <button onClick={signOut} disabled={busy} className="rounded border border-term-grid px-3 py-1 text-term-fg">Sign out</button>
      </div>
      {children}
    </>;
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-12">
      <h1 className="mb-2 text-xl font-bold text-term-accent">liddar terminal</h1>
      <p className="mb-7 text-sm text-term-muted">Private research workspace</p>
      <section className="rounded-md border border-term-grid bg-term-panel p-6" aria-label="Owner sign-in">
        {!client ? <>
          <h2 className="mb-2 font-semibold">Setup is not complete</h2>
          <p className="text-sm text-term-muted">Owner sign-in must be connected before this workspace can open.</p>
        </> : phase === 'login' ? <form onSubmit={signIn}>
          <h2 className="mb-5 font-semibold">Sign in as owner</h2>
          <label className="mb-4 block text-xs text-term-muted">Email
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
          </label>
          <label className="mb-5 block text-xs text-term-muted">Password
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
          </label>
          <button type="submit" disabled={busy} className={BUTTON}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form> : phase === 'checking' ? <p role="status" className="text-sm text-term-muted">Verifying your session…</p> : <>
          <h2 className="mb-3 font-semibold">{phase === 'denied' ? 'Owner account required' : phase === 'expired' ? 'Sign in again' : 'Verification unavailable'}</h2>
          <div className="flex gap-3">
            {phase === 'unavailable' && <button className={BUTTON} onClick={() => setRetry((v) => v + 1)}>Try again</button>}
            <button className="rounded border border-term-grid px-3 py-2 text-sm" onClick={signOut} disabled={busy}>Back to sign-in</button>
          </div>
        </>}
        {error && <p role="alert" className="mt-4 text-sm text-term-down">{error}</p>}
      </section>
    </main>
  );
}
