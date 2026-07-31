'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useVault } from '@/lib/vault/vault-provider';
import { EnvelopeError } from '@/lib/crypto/envelope';
import { isPlausibleRecoveryCode } from '@/lib/crypto/recovery';
import {
  Button,
  Callout,
  ErrorMessage,
  MINIMUM_PASSPHRASE_LENGTH,
  PassphraseField,
  Screen,
  TextField,
} from '@/components/ui';

export default function RecoverPage() {
  const router = useRouter();
  const { recover } = useVault();

  const [code, setCode] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeLooksRight = isPlausibleRecoveryCode(code);
  const tooShort = passphrase.length > 0 && passphrase.length < MINIMUM_PASSPHRASE_LENGTH;
  const mismatch = confirmation.length > 0 && confirmation !== passphrase;
  const ready =
    codeLooksRight && passphrase.length >= MINIMUM_PASSPHRASE_LENGTH && confirmation === passphrase;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);

    try {
      await recover(code, passphrase);
      router.replace('/vault');
    } catch (recoverError) {
      setError(
        recoverError instanceof EnvelopeError
          ? 'That code does not match this vault. Check it against your printed copy.'
          : recoverError instanceof Error
            ? recoverError.message
            : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Use your recovery code"
      lead="The code you printed when you set up your vault. Enter it here and choose a new passphrase."
    >
      <form onSubmit={submit} className="grid gap-7">
        <TextField
          label="Recovery code"
          hint="Starts with FGK1. Capitals and dashes do not matter."
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          className="font-mono"
          placeholder="FGK1-XXXXX-XXXXX-…"
          error={
            code.length > 12 && !codeLooksRight
              ? 'That does not look like a complete recovery code yet.'
              : null
          }
        />

        <div className="grid gap-5 border-t border-[var(--color-line)] pt-7">
          <PassphraseField
            label="Choose a new passphrase"
            name="new-passphrase"
            autoComplete="new-password"
            value={passphrase}
            onChange={setPassphrase}
            showStrength
            hint="Four unrelated words beats one clever word."
            error={tooShort ? `At least ${MINIMUM_PASSPHRASE_LENGTH} characters, please.` : null}
          />

          <PassphraseField
            label="Type it once more"
            name="confirm-passphrase"
            autoComplete="new-password"
            value={confirmation}
            onChange={setConfirmation}
            error={mismatch ? 'These two do not match.' : null}
          />
        </div>

        <Callout title="Your information is untouched">
          Nothing gets re-encrypted and nothing is lost. Only the passphrase changes — and this
          recovery code keeps working, so hold on to it.
        </Callout>

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" busy={busy} fullWidth disabled={!ready}>
          {busy ? 'Unlocking…' : 'Set my new passphrase'}
        </Button>

        <p className="text-center">
          <Link href="/unlock" className="font-medium text-[var(--color-accent)] hover:underline">
            I remembered it after all
          </Link>
        </p>
      </form>
    </Screen>
  );
}
