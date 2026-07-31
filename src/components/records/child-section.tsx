'use client';

/**
 * A collection beneath a record — a vehicle's service history, a person's ID
 * documents, a property's appliances.
 *
 * Children collapse to a one-line summary and expand into the same autosave
 * form the parent uses. A property can easily have fifteen appliances, and
 * fifteen open forms is not a page anyone can read.
 *
 * "Add" creates the row immediately and opens it, rather than putting a blank
 * form behind a modal that demands a name first. The record exists the moment
 * you decide to add one, so nothing typed afterwards can be lost.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ChildSection as ChildSectionSpec } from '@/lib/records/definition';
import type { LoadedRecord } from '@/lib/records/repository';
import { useRepository } from '@/lib/records/use-records';
import { useVault } from '@/lib/vault/vault-provider';
import { RecordForm } from './record-form';
import { Button, ErrorMessage } from '@/components/ui';

export function ChildSection({
  section,
  parentId,
}: {
  section: ChildSectionSpec;
  parentId: string;
}) {
  const { definition } = section;
  const { state } = useVault();
  const repository = useRepository();
  const familyId = state.status === 'unlocked' ? state.familyId : null;

  const [children, setChildren] = useState<LoadedRecord[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!repository || !familyId) return;
    try {
      const summaries = await repository.list(definition, familyId, parentId);
      // Children are loaded in full rather than as summaries: they are few, and
      // a collapsed row still needs decrypted values to summarise itself.
      const loaded = await Promise.all(
        summaries.map((summary) => repository.load(definition, summary.id)),
      );
      setChildren(loaded.filter((record): record is LoadedRecord => record !== null));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [definition, familyId, parentId, repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function add() {
    if (!repository || !familyId) return;
    setBusy(true);
    setError(null);
    try {
      const created = await repository.create(definition, familyId, {}, parentId);
      await reload();
      setOpenId(created.id);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setBusy(false);
    }
  }

  async function removeChild(id: string) {
    if (!repository) return;
    try {
      await repository.remove(definition, id);
      setOpenId((current) => (current === id ? null : current));
      await reload();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    }
  }

  return (
    <section className="border-t border-[var(--color-line)] pt-6">
      <h2 className="text-xl font-bold">{section.title}</h2>

      <ErrorMessage>{error}</ErrorMessage>

      {/* Until these load, the section is a heading with nothing under it,
          which reads as empty when it may not be. */}
      {children === null && !error && (
        <p className="mt-2 text-[var(--color-ink-soft)]">Loading…</p>
      )}

      {children && children.length === 0 && (
        <p className="mt-2 text-[var(--color-ink-soft)]">{section.emptyMessage}</p>
      )}

      {children && children.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {children.map((child) => (
            <li
              key={child.id}
              className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]"
            >
              <button
                type="button"
                onClick={() => setOpenId((current) => (current === child.id ? null : child.id))}
                aria-expanded={openId === child.id}
                className="flex min-h-[var(--spacing-touch)] w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="font-medium">
                  {section.summarize(child.values) || `Untitled ${definition.singular.toLowerCase()}`}
                </span>
                <span aria-hidden className="text-[var(--color-ink-soft)]">
                  {openId === child.id ? '▲' : '▼'}
                </span>
              </button>

              {openId === child.id && (
                <div className="border-t border-[var(--color-line)] p-4">
                  <ChildForm
                    section={section}
                    child={child}
                    onSaved={reload}
                    onDelete={() => removeChild(child.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Button variant="secondary" onClick={add} busy={busy}>
          {section.addLabel}
        </Button>
      </div>
    </section>
  );
}

function ChildForm({
  section,
  child,
  onSaved,
  onDelete,
}: {
  section: ChildSectionSpec;
  child: LoadedRecord;
  onSaved: () => Promise<void>;
  onDelete: () => void;
}) {
  const repository = useRepository();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="grid gap-5">
      <RecordForm
        definition={section.definition}
        initialValues={child.values}
        onSave={async (patch) => {
          if (!repository) throw new Error('Your vault is locked');
          await repository.update(section.definition, child.id, child.cek, patch);
          // Refreshes the collapsed summary, which is built from saved values.
          await onSaved();
        }}
      />

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Delete this? It cannot be undone.</span>
          <Button variant="danger" onClick={onDelete}>
            Yes, delete
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button variant="quiet" onClick={() => setConfirming(true)}>
          Delete this {section.definition.singular.toLowerCase()}
        </Button>
      )}
    </div>
  );
}
