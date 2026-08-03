'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { rememberAccountPassword } from '@/lib/auth/passphrase-conflict';
import { Button, Callout, ErrorMessage, PassphraseField, Screen } from '@/components/ui';

const MINIMUM_PASSWORD_LENGTH = 10;

/**
 * Setting a new sign-in password, reached from a reset email.
 *
 * The recovery link goes through /auth/callback, which exchanges the code for a
 * session and sends the visitor here — so by the time this renders they are
 * signed in and `updateUser` is all that is left.
 *
 * This changes only how they sign in. The vault passphrase is untouched and
 * unreachable from here, which is worth saying on the screen: someone arriving
 * after a forgotten password may well believe this is the way back into their
 * data, and it is not.
 */
export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < MINIMUM_PASSWORD_LENGTH;
  const mismatch = confirmation.length > 0 && confirmation !== password;
  const ready = password.length >= MINIMUM_PASSWORD_LENGTH && confirmation === password;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);

    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;

      rememberAccountPassword(password);
      setPassword('');
      setConfirmation('');
      router.replace('/vault');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not change your password. The link may have expired.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Choose a new password" lead="This is the password you sign in with.">
      <form onSubmit={submit} className="grid gap-6">
        <PassphraseField
          label="New password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          showStrength
          error={tooShort ? `At least ${MINIMUM_PASSWORD_LENGTH} characters, please.` : null}
        />

        <PassphraseField
          label="Type it once more"
          name="confirm-password"
          autoComplete="new-password"
          value={confirmation}
          onChange={setConfirmation}
          error={mismatch ? 'These two do not match.' : null}
        />

        <Callout tone="warning" title="This does not unlock your vault">
          Your vault passphrase is separate and is not stored anywhere we can reach. If that is what
          you have forgotten, use your recovery code instead.
        </Callout>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" busy={busy} fullWidth disabled={!ready}>
          Save my new password
        </Button>
      </form>
    </Screen>
  );
}
