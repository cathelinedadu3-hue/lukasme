import { useEffect, useState } from 'react';
import { getSettings, oauthLogin } from '@netlify/identity';
import { LoaderCircle } from 'lucide-react';

export function GoogleSignIn({ disabled, onError }: { disabled: boolean; onError: (message: string) => void }) {
 const [status, setStatus] = useState<'loading' | 'enabled' | 'disabled' | 'error'>('loading');
 const [redirecting, setRedirecting] = useState(false);
 useEffect(() => {
  let cancelled = false;
  getSettings().then(settings => {
   if (!cancelled) setStatus(settings.providers.google ? 'enabled' : 'disabled');
  }).catch(() => { if (!cancelled) setStatus('error'); });
  return () => { cancelled = true; };
 }, []);
 function signIn() {
  setRedirecting(true);
  onError('');
  try { oauthLogin('google'); } catch (error) {
   // The SDK starts navigation, then throws this sentinel intentionally.
   if (error instanceof Error && error.message === 'Redirecting to OAuth provider') return;
   setRedirecting(false);
   onError('Google sign-in could not start. Please try again.');
  }
 }
 if (status !== 'enabled') return <p className="auth-provider-status" role="status">{status === 'loading' ? 'Checking Google sign-in…' : status === 'error' ? 'Google sign-in is temporarily unavailable. Please try again later.' : 'Google sign-in is not available yet.'}</p>;
 return <button type="button" className="button secondary full auth-google" disabled={disabled || redirecting} onClick={signIn}>
  {redirecting ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.05a10 10 0 0 0 0 9.04l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.52l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.59A5.99 5.99 0 0 1 12 5.95Z"/></svg>}
  {redirecting ? 'Connecting to Google…' : 'Continue with Google'}
 </button>;
}
