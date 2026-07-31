/**
 * Reading and writing records, with the encryption handled here so that no
 * screen above this layer has to think about it.
 *
 * The rule this enforces: a field marked `secret` in a definition is sealed on
 * the way out and opened on the way back, every time, with no way for a caller
 * to accidentally write one in the clear. Getting that wrong once, in one form,
 * would put a social security number in a readable column — so it does not
 * happen in forms at all.
 */

import { generateCek, unwrapCek } from '@/lib/crypto/keys';
import { seal, open, fieldContext, isSealedEnvelope, type SealedEnvelope } from '@/lib/crypto/envelope';
import {
  fromDbValue,
  listSelection,
  maskedHint,
  toDbValue,
  type FormValues,
  type RecordDefinition,
  type FieldSpec,
} from './definition';
import type { RecordGateway, Row } from './gateway';

export interface RecordSummary {
  id: string;
  title: string;
  subtitle: string | null;
  updatedAt: string | null;
  /** Tier-0 columns and hints, for rendering a list without unlocking anything. */
  row: Row;
}

export interface LoadedRecord {
  id: string;
  values: FormValues;
  /**
   * This record's content key. Held by the form so that autosaving a field does
   * not re-fetch and re-unwrap on every keystroke.
   */
  cek: CryptoKey;
}

export class RecordRepository {
  constructor(
    private readonly gateway: RecordGateway,
    private readonly dek: CryptoKey,
  ) {}

  /**
   * Lists records without opening a single envelope.
   *
   * Two hundred contacts would otherwise mean two hundred key unwrappings to
   * draw a screen that shows names. The hint columns exist for exactly this.
   */
  async list(definition: RecordDefinition, familyId: string): Promise<RecordSummary[]> {
    const rows = await this.gateway.list(definition.table, familyId, listSelection(definition));

    return rows
      .map((row) => ({
        id: String(row.id),
        title: (row[definition.titleField] as string | null) ?? 'Untitled',
        subtitle: definition.subtitleField
          ? ((row[definition.subtitleField] as string | null) ?? null)
          : null,
        updatedAt: (row.updated_at as string | null) ?? null,
        row,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async load(definition: RecordDefinition, id: string): Promise<LoadedRecord | null> {
    const columns = [
      'id',
      'wrapped_cek',
      ...definition.fields.map((field) => field.name),
      ...definition.fields.flatMap((field) => (field.hintColumn ? [field.hintColumn] : [])),
    ];

    const row = await this.gateway.get(definition.table, id, [...new Set(columns)]);
    if (!row) return null;

    if (!isSealedEnvelope(row.wrapped_cek)) {
      throw new Error('This record is missing its content key');
    }

    const { key: cek } = await unwrapCek(this.dek, row.wrapped_cek);
    const values: FormValues = {};

    for (const field of definition.fields) {
      values[field.name] = field.secret
        ? await this.openSecret(definition, cek, id, field, row[field.name])
        : fromDbValue(field, (row[field.name] ?? null) as never);
    }

    return { id, values, cek };
  }

  private async openSecret(
    definition: RecordDefinition,
    cek: CryptoKey,
    id: string,
    field: FieldSpec,
    stored: unknown,
  ): Promise<string> {
    if (!stored) return '';
    if (!isSealedEnvelope(stored)) return '';
    return open(cek, stored);
  }

  /**
   * Creates a record.
   *
   * The id is minted here rather than by the database because the additional
   * authenticated data binds each ciphertext to its own row and column — which
   * requires knowing the id before anything is sealed.
   */
  async create(
    definition: RecordDefinition,
    familyId: string,
    values: FormValues,
  ): Promise<LoadedRecord> {
    const id = crypto.randomUUID();
    const { key: cek, wrapped } = await generateCek(this.dek);

    const encoded = await this.encodeFields(definition, cek, id, values);

    // Defaults fill NOT NULL enums the user has not chosen yet, but must never
    // overwrite something they did enter.
    const defaults: Row = {};
    for (const [column, value] of Object.entries(definition.createDefaults ?? {})) {
      if (encoded[column] === undefined || encoded[column] === null) {
        defaults[column] = value;
      }
    }

    const row: Row = {
      id,
      family_id: familyId,
      wrapped_cek: wrapped,
      ...encoded,
      ...defaults,
    };

    await this.gateway.insert(definition.table, row);
    return { id, values, cek };
  }

  async update(
    definition: RecordDefinition,
    id: string,
    cek: CryptoKey,
    patch: FormValues,
  ): Promise<void> {
    const encoded = await this.encodeFields(definition, cek, id, patch);
    if (Object.keys(encoded).length === 0) return;
    await this.gateway.update(definition.table, id, encoded);
  }

  async remove(definition: RecordDefinition, id: string): Promise<void> {
    await this.gateway.remove(definition.table, id);
  }

  /** Turns form values into database columns, sealing anything marked secret. */
  private async encodeFields(
    definition: RecordDefinition,
    cek: CryptoKey,
    id: string,
    values: FormValues,
  ): Promise<Row> {
    const row: Row = {};

    for (const field of definition.fields) {
      if (!(field.name in values)) continue;
      const value = values[field.name];

      if (!field.secret) {
        row[field.name] = toDbValue(field, value);
        continue;
      }

      const text = typeof value === 'string' ? value.trim() : '';

      if (text === '') {
        row[field.name] = null;
        if (field.hintColumn) row[field.hintColumn] = null;
        continue;
      }

      row[field.name] = await seal(
        cek,
        text,
        fieldContext(definition.table, id, field.name),
      );

      // The masked form is deliberately plaintext, so a list can show
      // "••••4821" without an unlocked vault.
      if (field.hintColumn) row[field.hintColumn] = maskedHint(text);
    }

    return row;
  }
}

/** Blank form values for a new record. */
export function emptyValues(definition: RecordDefinition): FormValues {
  const values: FormValues = {};
  for (const field of definition.fields) {
    values[field.name] = field.kind === 'boolean' ? false : '';
  }
  return values;
}

export type { SealedEnvelope };
