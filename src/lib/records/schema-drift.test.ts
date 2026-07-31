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
import { listSelection } from './definition';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Pulls column names out of `create table public.x (...)` blocks.
 *
 * Deliberately simple: it only has to understand the migrations in this
 * repository, and a parser sophisticated enough for arbitrary SQL would be
 * harder to trust than the thing it is checking.
 */
function columnsByTable(): Map<string, Set<string>> {
  const sql = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    .join('\n');

  const tables = new Map<string, Set<string>>();
  const createTable = /create table public\.(\w+)\s*\(([\s\S]*?)\n\);/g;

  for (const [, table, body] of sql.matchAll(createTable)) {
    const columns = new Set<string>();

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('--')) continue;

      // Skip table-level constraints, which are not columns.
      if (/^(constraint|primary key|unique|foreign key|check)\b/i.test(line)) continue;

      const match = /^(\w+)\s+/.exec(line);
      if (match) columns.add(match[1]);
    }

    tables.set(table, columns);
  }

  return tables;
}

const schema = columnsByTable();

describe('the migrations parse', () => {
  it('finds the tables the definitions use', () => {
    for (const definition of ALL_DEFINITIONS) {
      expect(schema.has(definition.table), `table ${definition.table}`).toBe(true);
    }
  });

  it('picks up ordinary columns and skips constraints', () => {
    const contacts = schema.get('contacts')!;
    expect(contacts.has('name')).toBe(true);
    expect(contacts.has('account_number_hint')).toBe(true);
    expect(contacts.has('constraint')).toBe(false);
  });
});

describe.each(ALL_DEFINITIONS.map((definition) => [definition.slug, definition] as const))(
  '%s',
  (slug, definition) => {
    const columns = schema.get(definition.table)!;

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
      // Every family-scoped record gets these, and the repository writes them
      // on create without consulting the definition.
      for (const required of ['id', 'family_id', 'wrapped_cek']) {
        expect(columns.has(required), `${definition.table}.${required}`).toBe(true);
      }
    });
  },
);
