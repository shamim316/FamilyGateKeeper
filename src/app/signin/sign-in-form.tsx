'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { rememberAccountPassword } from '@/lib/auth/passphrase-conflict';
import {
  Button,
  Callout,
  ErrorMessage,
  PassphraseField,
  Screen,
  TextField,
} from '@/components/ui';

const LINK_ERRORS: Record<string, string> = {
  'link-expired': 'That link has expired or was already used.',
  'missing-code': 'That link was incomplete. Try again.',
};

/** Supabase's own floor is six; a vault deserves more. */
const MINIMUM_PASSWORD_LENGTH = 10;

type Mode = 'signin' | 'signup';

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(LINK_ERRORS[params.get('error') ?? ''] ?? null);
  const [linkSent, setLinkSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/vault';
  const passwordTooShort = password.length > 0 && password.length < MINIMUM_PASSWORD_LENGTH;
  const ready = email.trim().length > 0 && password.length >= MINIMUM_PASSWORD_LENGTH;

  function describe(caught: unknown, fallback: string): string {
    if (!(caught instanceof Error)) return fallback;

    // Supabase's wording is accurate and unhelpful. These three are almost
    // everything people actually hit.
    if (/invalid login credentials/i.test(caught.message)) {
      return 'That email and password do not match an account.';
    }
    if (/already registered|already exists/i.test(caught.message)) {
      return 'There is already an account with that email. Try signing in.';
    }
    if (/rate limit|too many/i.test(caught.message)) {
      return 'Too many attempts for now. Wait a minute and try again.';
    }
    return caught.message || fallback;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const credentials = { email: email.trim(), password };

      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp(credentials);
        if (signUpError) throw signUpError;

        // With email confirmation switched on, Supabase returns a user but no
        // session and sends a message. Say so rather than pretending.
        if (!data.session) {
          setLinkSent(true);
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword(credentials);
        if (signInError) throw signInError;
      }

      // Held as a digest only, so the setup screen can refuse a passphrase that
      // is the same as this. Discarded once the vault exists.
      rememberAccountPassword(password);
      setPassword('');
      router.replace(destination);
    } catch (caught) {
      setError(
        describe(
          caught,
          mode === 'signup' ? 'Could not create your account.' : 'Could not sign you in.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    if (email.trim().length === 0) {
      setError('Enter your email address first.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('next', destination);

      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callback.toString() },
      });
      if (sendError) throw sendError;
      setLinkSent(true);
    } catch (caught) {
      setError(describe(caught, 'We could not send that email.'));
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset() {
    if (email.trim().length === 0) {
      setError('Enter your email address first.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('next', '/auth/reset');

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: callback.toString(),
      });
      if (resetError) throw resetError;
      setResetSent(true);
    } catch (caught) {
      setError(describe(caught, 'We could not send that email.'));
    } finally {
      setBusy(false);
    }
  }

  if (linkSent || resetSent) {
    return (
      <Screen title="Check your email">
        <div className="grid gap-6">
          <p className="text-lg">
            We sent {resetSent ? 'a password reset link' : 'a link'} to{' '}
            <strong className="break-all">{email}</strong>. Open it on this device.
          </p>
          <Callout title="Nothing arriving?">
            A new project sends only a handful of emails an hour until you connect your own mail
            service. A password gets you in without waiting.
          </Callout>
          <Button
            variant="quiet"
            onClick={() => {
              setLinkSent(false);
              setResetSent(false);
            }}
          >
            Back
          </Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      title={mode === 'signup' ? 'Create your account' : 'Sign in'}
      lead={
        mode === 'signup'
          ? 'An email address and a password. You will choose a separate passphrase for the vault itself in a moment.'
          : 'Welcome back.'
      }
    >
      <form onSubmit={submit} className="grid gap-6">
        <TextField
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />

        <PassphraseField
          label="Password"
          name="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={setPassword}
          showStrength={mode === 'signup'}
          error={
            passwordTooShort ? `At least ${MINIMUM_PASSWORD_LENGTH} characters, please.` : null
          }
        />

        {mode === 'signup' && (
          <Callout tone="warning" title="This is not the passphrase that unlocks your vault">
            This password signs you in, and we can reset it. The vault passphrase comes next, never
            leaves your device, and cannot be reset by anyone. Make them different — we will not let
            you use the same one twice.
          </Callout>
        )}

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" busy={busy} fullWidth disabled={!ready}>
          {mode === 'signup' ? 'Create my account' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-8 grid gap-3 border-t border-[var(--color-line)] pt-6 text-center">
        <Button
          variant="quiet"
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup');
            setError(null);
          }}
        >
          {mode === 'signup' ? 'I already have an account' : 'Create an account instead'}
        </Button>

        {mode === 'signin' && (
          <>
            <Button variant="quiet" onClick={sendMagicLink} busy={busy}>
              Email me a link instead
            </Button>
            <Button variant="quiet" onClick={sendPasswordReset} busy={busy}>
              I have forgotten my password
            </Button>
          </>
        )}
      </div>
    </Screen>
  );
}
