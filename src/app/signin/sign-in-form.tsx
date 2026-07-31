'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Callout, ErrorMessage, Screen, TextField } from '@/components/ui';

const LINK_ERRORS: Record<string, string> = {
  'link-expired': 'That link has expired or was already used. Here is a fresh one.',
  'missing-code': 'That link was incomplete. Try sending yourself a new one.',
};

export function SignInForm() {
  const params = useSearchParams();
  const next = params.get('next');

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(LINK_ERRORS[params.get('error') ?? ''] ?? null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const callback = new URL('/auth/callback', window.location.origin);
      if (next) callback.searchParams.set('next', next);

      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callback.toString() },
      });

      if (sendError) throw sendError;
      setSent(true);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'We could not send that email. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen title="Check your email">
        <div className="grid gap-6">
          <p className="text-lg">
            We sent a sign-in link to <strong className="break-all">{email}</strong>. Open it on this
            device and you are in.
          </p>
          <Callout title="No password to remember">
            Signing in is just this link. The one thing you will need to remember is your
            passphrase, which is what actually unlocks your information.
          </Callout>
          <Button variant="quiet" onClick={() => setSent(false)}>
            Use a different email address
          </Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      title="Sign in"
      lead="Enter your email and we will send you a link. There is no password to remember."
    >
      <form onSubmit={send} className="grid gap-6">
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

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" busy={busy} fullWidth disabled={email.trim().length === 0}>
          Email me a link
        </Button>
      </form>
    </Screen>
  );
}
