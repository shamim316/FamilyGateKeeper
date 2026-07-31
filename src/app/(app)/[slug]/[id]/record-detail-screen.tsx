'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { definitionBySlug } from '@/lib/records/definitions';
import { useRecord } from '@/lib/records/use-records';
import { RecordForm } from '@/components/records/record-form';
import { useVault } from '@/lib/vault/vault-provider';
import { Button, Callout, ErrorMessage, Screen } from '@/components/ui';

export function RecordDetailScreen({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const definition = definitionBySlug(slug)!;
  const { state } = useVault();

  const { record, error, missing, loading, save, remove } = useRecord(definition, id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (state.status !== 'unlocked') {
    return (
      <Screen title="Your vault is locked">
        <p className="text-[var(--color-ink-soft)]">
          Unlock it with your passphrase to see this.
        </p>
      </Screen>
    );
  }

  const backLink = (
    <Link
      href={`/${definition.slug}`}
      className="text-sm font-medium text-[var(--color-accent)] hover:underline"
    >
      ← {definition.plural}
    </Link>
  );

  if (missing) {
    return (
      <Screen title="Not here">
        <div className="grid gap-5">
          <p className="text-[var(--color-ink-soft)]">
            This {definition.singular.toLowerCase()} has been deleted, or it was never here.
          </p>
          {backLink}
        </div>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Could not open this">
        <div className="grid gap-5">
          <ErrorMessage>{error.message}</ErrorMessage>
          {backLink}
        </div>
      </Screen>
    );
  }

  if (loading || !record) {
    return (
      <Screen>
        <p className="text-[var(--color-ink-soft)]">Opening…</p>
      </Screen>
    );
  }

  const title = String(record.values[definition.titleField] ?? '').trim();

  async function deleteRecord() {
    setDeleteError(null);
    try {
      await remove();
      router.replace(`/${definition.slug}`);
    } catch (removeError) {
      setDeleteError(removeError instanceof Error ? removeError.message : String(removeError));
    }
  }

  return (
    <Screen width="wide">
      <div className="mb-6">
        {backLink}
        <h1 className="mt-2 text-3xl font-bold">
          {title || `New ${definition.singular.toLowerCase()}`}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Changes save as you type. There is no save button.
        </p>
      </div>

      <RecordForm
        definition={definition}
        initialValues={record.values}
        onSave={save}
        autoFocusFirst={title === ''}
      />

      <div className="mt-10 border-t border-[var(--color-line)] pt-6">
        {confirmingDelete ? (
          <Callout tone="danger" title={`Delete this ${definition.singular.toLowerCase()}?`}>
            <div className="mt-3 grid gap-3">
              <p>This cannot be undone.</p>
              <ErrorMessage>{deleteError}</ErrorMessage>
              <div className="flex flex-wrap gap-3">
                <Button variant="danger" onClick={deleteRecord}>
                  Yes, delete it
                </Button>
                <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          </Callout>
        ) : (
          <Button variant="quiet" onClick={() => setConfirmingDelete(true)}>
            Delete this {definition.singular.toLowerCase()}
          </Button>
        )}
      </div>
    </Screen>
  );
}
