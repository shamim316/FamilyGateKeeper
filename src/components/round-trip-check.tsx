'use client';

/**
 * Temporary scaffolding for Milestone 3.
 *
 * Exercises the entire stack against real tables — mint a content key, seal a
 * value under it, write both to Postgres, read them back, unwrap, and open —
 * which is exactly the path every record form in Milestone 4 will take. It also
 * shows the row as the server sees it, so the central claim of the product can
 * be checked with one's own eyes rather than taken on trust.
 *
 * Replaced by the real Contacts screen in Milestone 4.
 */

import { useState } from 'react';
import { generateCek, unwrapCek } from '@/lib/crypto/keys';
import { seal, open, fieldContext, type SealedEnvelope } from '@/lib/crypto/envelope';
import { createClient } from '@/lib/supabase/client';
import { Button, Callout, ErrorMessage, TextField } from '@/components/ui';

interface Outcome {
  storedRow: string;
  decrypted: string;
}

export function RoundTripCheck({ dek, familyId }: { dek: CryptoKey; familyId: string }) {
  const [secret, setSecret] = useState('4417');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setOutcome(null);

    try {
      const supabase = createClient();

      // 1. A content key for this record, wrapped under the family data key.
      const { key: cek, wrapped } = await generateCek(dek);

      // 2. Insert with a placeholder id so the AAD can bind to it, matching
      //    what a real form will do.
      const id = crypto.randomUUID();
      const sealedSecret = await seal(
        cek,
        secret,
        fieldContext('contacts', id, 'account_number'),
      );

      const { error: insertError } = await supabase.from('contacts').insert({
        id,
        family_id: familyId,
        wrapped_cek: wrapped,
        name: 'Round-trip check',
        category: 'test',
        account_number: sealedSecret,
        account_number_hint: `••••${secret.slice(-4)}`,
      });
      if (insertError) throw insertError;

      // 3. Read it back as a cold client would.
      const { data, error: selectError } = await supabase
        .from('contacts')
        .select('id, name, account_number, account_number_hint, wrapped_cek')
        .eq('id', id)
        .single();
      if (selectError || !data) throw selectError ?? new Error('Row not found');

      const row = data as {
        account_number: SealedEnvelope;
        wrapped_cek: SealedEnvelope;
      };

      // 4. Unwrap and open.
      const { key: reopenedCek } = await unwrapCek(dek, row.wrapped_cek);
      const decrypted = await open(reopenedCek, row.account_number);

      setOutcome({ storedRow: JSON.stringify(data, null, 2), decrypted });

      // Leave nothing behind; this is a check, not a record.
      await supabase.from('contacts').delete().eq('id', id);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <h2 className="text-lg font-bold">Check the round trip</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Writes a secret to the database, reads it back, and decrypts it — so you can see what the
        server actually stored.
      </p>

      <div className="mt-5 grid gap-4">
        <TextField
          label="A secret to store"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />

        <Button onClick={run} busy={busy} variant="secondary">
          Store it, read it back, decrypt it
        </Button>

        <ErrorMessage>{error}</ErrorMessage>

        {outcome && (
          <div className="grid gap-4">
            <Callout title="What the server stored">
              <pre className="mt-2 overflow-x-auto text-xs leading-relaxed">
                {outcome.storedRow}
              </pre>
            </Callout>

            <Callout
              tone={outcome.decrypted === secret ? 'info' : 'danger'}
              title={outcome.decrypted === secret ? 'Decrypted correctly' : 'Mismatch'}
            >
              Read back: <strong className="font-mono">{outcome.decrypted}</strong>
            </Callout>
          </div>
        )}
      </div>
    </section>
  );
}
