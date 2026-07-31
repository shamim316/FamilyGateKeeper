'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { definitionBySlug } from '@/lib/records/definitions';
import { useCreateRecord, useRecordList } from '@/lib/records/use-records';
import { RecordList } from '@/components/records/record-list';
import { useVault } from '@/lib/vault/vault-provider';
import { Button, ErrorMessage, Screen } from '@/components/ui';

export function RecordListScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const definition = definitionBySlug(slug)!;
  const { state } = useVault();

  const { records, error, loading } = useRecordList(definition);
  const create = useCreateRecord(definition);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  if (state.status !== 'unlocked') {
    return <LockedNotice />;
  }

  async function addRecord() {
    setCreating(true);
    setCreateError(null);
    try {
      // Created empty and opened straight away, rather than behind a modal that
      // demands a name first. The record exists the moment you decide to add
      // one, so nothing typed after that can be lost.
      const created = await create({});
      router.push(`/${definition.slug}/${created.id}`);
    } catch (addError) {
      setCreateError(addError instanceof Error ? addError.message : String(addError));
      setCreating(false);
    }
  }

  return (
    <Screen width="wide">
      <div className="mb-6">
        <Link href="/vault" className="text-sm font-medium text-[var(--color-accent)] hover:underline">
          ← Your vault
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{definition.plural}</h1>
      </div>

      <ErrorMessage>{createError}</ErrorMessage>

      {loading && <p className="text-[var(--color-ink-soft)]">Opening…</p>}
      {error && <ErrorMessage>{error.message}</ErrorMessage>}

      {records && (
        <RecordList
          definition={definition}
          records={records}
          onCreate={addRecord}
          creating={creating}
        />
      )}
    </Screen>
  );
}

function LockedNotice() {
  return (
    <Screen title="Your vault is locked">
      <div className="grid gap-5">
        <p className="text-[var(--color-ink-soft)]">
          Unlock it with your passphrase to see what is in here.
        </p>
        <Button onClick={() => window.location.assign('/unlock')}>Unlock</Button>
      </div>
    </Screen>
  );
}
