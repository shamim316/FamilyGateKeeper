'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVault } from '@/lib/vault/vault-provider';
import { lockReasonMessage } from '@/lib/vault/session';
import { EnvelopeError } from '@/lib/crypto/envelope';
import { Button, Callout, ErrorMessage, PassphraseField, Screen } from '@/components/ui';

export default function UnlockPage() {
  const router = useRouter();
  const { state, status, loadingStatus, unlock } = useVault();

  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === 'unlocked') router.replace('/vault');
  }, [router, state.status]);

  useEffect(() => {
    if (loadingStatus) return;
    if (status?.state === 'family-missing' || status?.state === 'keys-missing') {
      router.replace('/setup');
    }
  }, [loadingStatus, router, status]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await unlock(passphrase);
      setPassphrase('');
      router.replace('/vault');
    } catch (unlockError) {
      // A failed GCM open is indistinguishable from a wrong passphrase, and in
      // practice always is one. Saying so beats "decryption failed".
      setError(
        unlockError instanceof EnvelopeError
          ? 'That passphrase does not open this vault. Try again.'
          : unlockError instanceof Error
            ? unlockError.message
            : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const reason = state.status === 'locked' ? lockReasonMessage(state.reason) : null;
  const familyName = status?.state === 'locked' ? status.family.name : null;

  return (
    <Screen
      title={familyName ? `Unlock ${familyName}` : 'Unlock your vault'}
      lead="Your passphrase never leaves this device. It is what turns the scrambled text back into your information."
    >
      <form onSubmit={submit} className="grid gap-6">
        {reason && <Callout>{reason}</Callout>}

        <PassphraseField
          label="Passphrase"
          name="passphrase"
          autoComplete="current-password"
          value={passphrase}
          onChange={setPassphrase}
        />

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" busy={busy} fullWidth disabled={passphrase.length === 0}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>

        {busy && (
          <p className="text-center text-sm text-[var(--color-ink-soft)]">
            This takes a second or two by design.
          </p>
        )}

        <p className="text-center">
          <Link href="/recover" className="font-medium text-[var(--color-accent)] hover:underline">
            I have forgotten my passphrase
          </Link>
        </p>
      </form>
    </Screen>
  );
}
