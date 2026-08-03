'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVault } from '@/lib/vault/vault-provider';
import {
  canCheckAgainstAccountPassword,
  forgetAccountPassword,
  isAccountPassword,
} from '@/lib/auth/passphrase-conflict';
import { RecoveryKitStep } from '@/components/recovery-kit-step';
import {
  Button,
  Callout,
  ErrorMessage,
  MINIMUM_PASSPHRASE_LENGTH,
  PassphraseField,
  Screen,
  TextField,
} from '@/components/ui';

type Step =
  | { name: 'details' }
  | { name: 'kit'; code: string; familyName: string };

export default function SetupPage() {
  const router = useRouter();
  const { setUp, status } = useVault();

  const [step, setStep] = useState<Step>({ name: 'details' });
  const [familyName, setFamilyName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resuming a setup abandoned after the family row was written.
  const existingFamily = status?.state === 'keys-missing' ? status.family : null;
  const effectiveName = existingFamily?.name ?? familyName;

  const tooShort = passphrase.length > 0 && passphrase.length < MINIMUM_PASSPHRASE_LENGTH;
  const mismatch = confirmation.length > 0 && confirmation !== passphrase;

  // Reusing the sign-in password here would make the vault key something the
  // server can verify, which is the one thing it must never be.
  const reusesPassword = isAccountPassword(passphrase);

  const ready =
    effectiveName.trim().length > 0 &&
    passphrase.length >= MINIMUM_PASSPHRASE_LENGTH &&
    confirmation === passphrase &&
    !reusesPassword;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);

    try {
      const result = await setUp(effectiveName.trim(), passphrase);
      // Held only long enough to show the kit, then dropped with the component.
      setStep({ name: 'kit', code: result.recoveryCode, familyName: result.family.name });
      setPassphrase('');
      setConfirmation('');
      forgetAccountPassword();
    } catch (setUpError) {
      setError(
        setUpError instanceof Error
          ? setUpError.message
          : 'Something went wrong setting up your vault.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (step.name === 'kit') {
    return (
      <Screen
        title="Save your recovery code"
        lead="Your vault is ready. One thing left, and it matters more than anything else here."
      >
        <RecoveryKitStep
          code={step.code}
          familyName={step.familyName}
          onDone={() => router.replace('/vault')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Set up your vault"
      lead="Two things and you are done: what to call your family, and a passphrase only you know."
    >
      <form onSubmit={submit} className="grid gap-7">
        {existingFamily ? (
          <Callout title={`Picking up where you left off — ${existingFamily.name}`}>
            You created your family but did not finish choosing a passphrase. Let us finish that now.
          </Callout>
        ) : (
          <TextField
            label="What should we call your family?"
            hint="Anything you like. The Whitfields, Mom &amp; Dad, 14 Oak Street."
            value={familyName}
            onChange={(event) => setFamilyName(event.target.value)}
            autoFocus
            required
          />
        )}

        <div className="grid gap-5 border-t border-[var(--color-line)] pt-7">
          <PassphraseField
            label="Choose a passphrase"
            name="new-passphrase"
            autoComplete="new-password"
            value={passphrase}
            onChange={setPassphrase}
            showStrength
            hint="Four unrelated words beats one clever word. Something you will still recall next year."
            error={
              reusesPassword
                ? 'This is your sign-in password. The vault needs a different one — see below.'
                : tooShort
                  ? `At least ${MINIMUM_PASSPHRASE_LENGTH} characters, please.`
                  : null
            }
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

        <Callout tone="warning" title="There is no password reset">
          This passphrase never leaves your device, so we could not reset it even if you asked. If
          you forget it, the recovery code we show you next is the only way back in.
        </Callout>

        {reusesPassword ? (
          <Callout tone="danger" title="Not your sign-in password">
            Your sign-in password is stored on our server, in a form we can check. If it also
            unlocked your vault, anyone who took that server could read your information — and the
            encryption would be for show. Please pick something else.
          </Callout>
        ) : (
          !canCheckAgainstAccountPassword() && (
            <Callout title="Use something different from your sign-in password">
              We can only compare the two when you have just signed in, so this one is on trust.
              Your sign-in password lives on our server; this passphrase must not.
            </Callout>
          )
        )}

        <ErrorMessage>{error}</ErrorMessage>

        <Button type="submit" busy={busy} fullWidth disabled={!ready}>
          {busy ? 'Creating your vault…' : 'Create my vault'}
        </Button>

        {busy && (
          <p className="text-center text-sm text-[var(--color-ink-soft)]">
            Scrambling your keys. This takes a moment on purpose — it is what makes a stolen copy
            of your data useless.
          </p>
        )}
      </form>
    </Screen>
  );
}
