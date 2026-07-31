'use client';

/**
 * A list of records.
 *
 * Cards rather than a table: on a phone a table of eight columns is unreadable,
 * and the two or three facts worth seeing at a glance fit on a card. Search is
 * client-side over the tier-0 columns already loaded, which is instant and
 * needs no round trip — and no decryption, since nothing sealed is here.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { RecordSummary } from '@/lib/records/repository';
import type { RecordDefinition } from '@/lib/records/definition';
import { Button, TextField } from '@/components/ui';

export function RecordList({
  definition,
  records,
  onCreate,
  creating,
}: {
  definition: RecordDefinition;
  records: RecordSummary[];
  onCreate: () => void;
  creating?: boolean;
}) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return records;
    return records.filter((record) =>
      [record.title, record.subtitle].some((value) =>
        (value ?? '').toLowerCase().includes(needle),
      ),
    );
  }, [query, records]);

  if (records.length === 0) {
    return (
      <div className="grid gap-6">
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line)] p-8 text-center">
          <p className="text-lg text-[var(--color-ink-soft)]">{definition.emptyMessage}</p>
          <div className="mt-6">
            <Button onClick={onCreate} busy={creating}>
              Add your first {definition.singular.toLowerCase()}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <TextField
            label={`Search ${definition.plural.toLowerCase()}`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Start typing a name"
          />
        </div>
        <Button onClick={onCreate} busy={creating}>
          Add {definition.singular.toLowerCase()}
        </Button>
      </div>

      {matches.length === 0 ? (
        <p className="text-[var(--color-ink-soft)]">
          Nothing matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="grid gap-3">
          {matches.map((record) => (
            <li key={record.id}>
              <Link
                href={`/${definition.slug}/${record.id}`}
                className="block min-h-[var(--spacing-touch)] rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 transition hover:border-[var(--color-accent)]"
              >
                <p className="font-semibold">{record.title}</p>
                {record.subtitle && (
                  <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{record.subtitle}</p>
                )}
                <SummaryFacts definition={definition} record={record} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The two or three things worth seeing without opening the record — a phone
 * number, a renewal date, the masked tail of an account number. All tier 0, so
 * this renders whether or not anything has been decrypted.
 */
function SummaryFacts({
  definition,
  record,
}: {
  definition: RecordDefinition;
  record: RecordSummary;
}) {
  const facts: string[] = [];

  for (const field of definition.fields) {
    if (facts.length >= 3) break;
    if (field.name === definition.titleField || field.name === definition.subtitleField) continue;

    if (field.hintColumn) {
      const hint = record.row[field.hintColumn];
      if (typeof hint === 'string' && hint) facts.push(`${field.label} ${hint}`);
      continue;
    }

    if (field.secret) continue;
    if (field.kind !== 'phone' && field.kind !== 'date') continue;

    const value = record.row[field.name];
    if (typeof value === 'string' && value) facts.push(`${field.label}: ${value}`);
  }

  if (facts.length === 0) return null;

  return (
    <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{facts.join(' · ')}</p>
  );
}
