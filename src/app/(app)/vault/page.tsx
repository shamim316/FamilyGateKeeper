'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useVault } from '@/lib/vault/vault-provider';
import { createClient } from '@/lib/supabase/client';
import { RoundTripCheck } from '@/components/round-trip-check';
import { Button, Callout, Screen } from '@/components/ui';

export default function VaultPage() {
  const router = useRouter();
  const { state, status, loadingStatus, lock } = useVault();

  // Where someone lands after signing in, so this is the fork in the road:
  // no family yet, keys not finished, or locked and needing a passphrase.
  useEffect(() => {
    if (loadingStatus || state.status === 'unlocked') return;

    if (status?.state === 'family-missing' || status?.state === 'keys-missing') {
      router.replace('/setup');
    } else if (status?.state === 'locked' && state.status === 'locked') {
      router.replace('/unlock');
    }
  }, [loadingStatus, router, state.status, status]);

  async function signOut() {
    lock('signed-out');
    await createClient().auth.signOut();
    router.replace('/');
  }

  if (state.status !== 'unlocked') {
    return (
      <Screen>
        <p className="text-[var(--color-ink-soft)]">Opening your vault…</p>
      </Screen>
    );
  }

  const familyName = status?.state === 'locked' ? status.family.name : 'your family';

  return (
    <Screen width="wide">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
            Unlocked
          </p>
          <h1 className="mt-1 text-3xl font-bold">{familyName}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => lock('manual')}>
            Lock
          </Button>
          <Button variant="quiet" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-6">
        <Callout title="The vault shell is working">
          Your passphrase unwrapped the key that decrypts your information, and it is held in memory
          only. Closing this tab or leaving it idle for fifteen minutes locks it again.
        </Callout>

        <RoundTripCheck dek={state.dek} familyId={state.familyId} />

        <p className="text-sm text-[var(--color-ink-soft)]">
          Next: the record screens — household members, home, and vehicles.
        </p>
      </div>
    </Screen>
  );
}
