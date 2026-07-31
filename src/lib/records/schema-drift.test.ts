/**
 * Checks every record definition against the actual migrations.
 *
 * A definition names database columns as strings. Mistype one and nothing
 * complains until a real insert fails against a real Postgres — which, with no
 * Supabase project yet, would mean finding out in production. Reading the
 * migrations and comparing is the cheapest way to make that a test failure
 * instead.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_DEFINITIONS } from './definitions';
import { CHILD_DEFINITIONS } from './core-definitions';
import { MORE_CHILD_DEFINITIONS } from './more-definitions';
import { listSelection, usesContentKey } from './definition';

/** Parents and children alike; a typo in a child is just as fatal. */
const EVERY_DEFINITION = [...ALL_DEFINITIONS, ...CHILD_DEFINITIONS, ...MORE_CHILD_DEFINITIONS];

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Pulls column names out of `create table public.x (...)` blocks.
 *
 * Deliberately simple: it only has to understand the migrations in this
 * repository, and a parser sophisticated enough for arbitrary SQL would be
 * harder to trust than the thing it is checking.
 */
interface TableColumns {
  all: Set<string>;
  /**
   * NOT NULL with no database default. Every one of these must be supplied on
   * insert or the very first create of that record type fails.
   */
  mustSupply: Set<string>;
}

function columnsByTable(): Map<string, TableColumns> {
  const sql = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    .join('\n');

  const tables = new Map<string, TableColumns>();
  const createTable = /create table public\.(\w+)\s*\(([\s\S]*?)\n\);/g;

  for (const [, table, body] of sql.matchAll(createTable)) {
    const all = new Set<string>();
    const mustSupply = new Set<string>();

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('--')) continue;

      // Skip table-level constraints, which are not columns.
      if (/^(constraint|primary key|unique|foreign key|check)\b/i.test(line)) continue;

      const match = /^(\w+)\s+/.exec(line);
      if (!match) continue;

      all.add(match[1]);

      const lowered = line.toLowerCase();
      if (lowered.includes('not null') && !lowered.includes('default')) {
        mustSupply.add(match[1]);
      }
    }

    tables.set(table, { all, mustSupply });
  }

  return tables;
}

/** Columns the repository writes itself, without consulting a definition. */
const SUPPLIED_BY_REPOSITORY = new Set(['id', 'family_id', 'wrapped_cek']);

const schema = columnsByTable();

describe('the migrations parse', () => {
  it('finds the tables the definitions use', () => {
    for (const definition of EVERY_DEFINITION) {
      expect(schema.has(definition.table), `table ${definition.table}`).toBe(true);
    }
  });

  it('spots NOT NULL columns that carry no default', () => {
    const contacts = schema.get('contacts')!;
    expect(contacts.mustSupply.has('name')).toBe(true);
    // Has a default, so the database fills it in.
    expect(contacts.mustSupply.has('created_at')).toBe(false);
    // Nullable.
    expect(contacts.mustSupply.has('phone')).toBe(false);
  });

  it('picks up ordinary columns and skips constraints', () => {
    const contacts = schema.get('contacts')!;
    expect(contacts.all.has('name')).toBe(true);
    expect(contacts.all.has('account_number_hint')).toBe(true);
    expect(contacts.all.has('constraint')).toBe(false);
  });
});

describe.each(EVERY_DEFINITION.map((definition) => [definition.table, definition] as const))(
  '%s',
  (slug, definition) => {
    const { all: columns, mustSupply } = schema.get(definition.table)!;

    it('only names fields that exist in the table', () => {
      const missing = definition.fields
        .map((field) => field.name)
        .filter((name) => !columns.has(name));

      expect(missing, `${slug} fields missing from ${definition.table}`).toEqual([]);
    });

    it('only names hint columns that exist', () => {
      const missing = definition.fields
        .flatMap((field) => (field.hintColumn ? [field.hintColumn] : []))
        .filter((name) => !columns.has(name));

      expect(missing, `${slug} hint columns missing from ${definition.table}`).toEqual([]);
    });

    it('names a title and subtitle column that exist', () => {
      expect(columns.has(definition.titleField), `${slug}.${definition.titleField}`).toBe(true);
      if (definition.subtitleField) {
        expect(columns.has(definition.subtitleField), `${slug}.${definition.subtitleField}`).toBe(
          true,
        );
      }
    });

    it('selects only columns that exist when listing', () => {
      const missing = listSelection(definition).filter((column) => !columns.has(column));
      expect(missing, `${slug} list selection`).toEqual([]);
    });

    it('defaults only columns that exist', () => {
      const missing = Object.keys(definition.createDefaults ?? {}).filter(
        (column) => !columns.has(column),
      );
      expect(missing, `${slug} create defaults`).toEqual([]);
    });

    it('carries the columns the repository always writes', () => {
      for (const required of ['id', 'family_id']) {
        expect(columns.has(required), `${definition.table}.${required}`).toBe(true);
      }
    });

    it('agrees with the table about whether it has a content key', () => {
      // Claiming a content key the table lacks fails every insert with a NOT
      // NULL violation; disclaiming one it has fails the same way.
      expect(usesContentKey(definition), `${definition.table}.wrapped_cek`).toBe(
        columns.has('wrapped_cek'),
      );
    });

    it('has somewhere to seal its secrets', () => {
      const hasSecret = definition.fields.some((field) => field.secret);
      if (hasSecret) {
        expect(usesContentKey(definition), `${definition.table} has secret fields`).toBe(true);
      }
    });

    it('supplies every column the database insists on', () => {
      // The create flow inserts an empty record and opens it, so any NOT NULL
      // column without a database default has to come from somewhere: the
      // repository, the parent link, a create default, or a field marked
      // required (which writes an empty string rather than null).
      const defaulted = new Set(Object.keys(definition.createDefaults ?? {}));
      const requiredFields = new Set(
        definition.fields.filter((field) => field.required).map((field) => field.name),
      );

      const unsupplied = [...mustSupply].filter(
        (column) =>
          !SUPPLIED_BY_REPOSITORY.has(column) &&
          column !== definition.parentColumn &&
          !defaulted.has(column) &&
          !requiredFields.has(column),
      );

      expect(unsupplied, `${definition.table} would fail its first insert`).toEqual([]);
    });

    it('only marks a field required when the column really is NOT NULL', () => {
      const overclaimed = definition.fields
        .filter((field) => field.required)
        .map((field) => field.name)
        .filter((name) => !mustSupply.has(name));

      // Writing '' into a nullable column loses the distinction between "none"
      // and "not filled in yet".
      expect(overclaimed, `${definition.table} required fields that are nullable`).toEqual([]);
    });

    it('points at a parent column that exists', () => {
      if (!definition.parentColumn) return;
      expect(columns.has(definition.parentColumn), `${definition.table}.${definition.parentColumn}`).toBe(
        true,
      );
    });
  },
);
