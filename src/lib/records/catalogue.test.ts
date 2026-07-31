/**
 * Properties that must hold across every category, so adding the next one
 * cannot quietly break the app.
 *
 * A definition is data, and data with no invariants drifts. These are the
 * checks that a screen would otherwise have to make at runtime.
 */

import { describe, expect, it } from 'vitest';
import { ALL_DEFINITIONS, definitionBySlug } from './definitions';
import { CHILD_DEFINITIONS } from './core-definitions';
import { MORE_CHILD_DEFINITIONS } from './more-definitions';
import { HOME_GROUPS, listSelection } from './definition';

const EVERY = [...ALL_DEFINITIONS, ...CHILD_DEFINITIONS, ...MORE_CHILD_DEFINITIONS];

describe('the catalogue', () => {
  it('covers every category the plan promised', () => {
    expect(ALL_DEFINITIONS.map((definition) => definition.slug).sort()).toEqual(
      [
        'accounts',
        'connections',
        'contacts',
        'estate',
        'homes',
        'memberships',
        'people',
        'pets',
        'policies',
        'subscriptions',
        'travel',
        'valuables',
        'vehicles',
      ].sort(),
    );
  });

  it('gives every top-level section a home on the front screen', () => {
    // A section with no group renders nowhere, which is worse than ugly.
    for (const definition of ALL_DEFINITIONS) {
      expect(definition.homeGroup, `${definition.slug} homeGroup`).toBeDefined();
      expect(HOME_GROUPS.map((group) => group.id)).toContain(definition.homeGroup);
    }
  });

  it('leaves no home group empty', () => {
    for (const group of HOME_GROUPS) {
      const members = ALL_DEFINITIONS.filter((definition) => definition.homeGroup === group.id);
      expect(members.length, `${group.title} is empty`).toBeGreaterThan(0);
    }
  });

  it('routes every top-level slug', () => {
    for (const definition of ALL_DEFINITIONS) {
      expect(definitionBySlug(definition.slug)).toBe(definition);
    }
  });

  it('keeps slugs unique and clear of the vault shell routes', () => {
    const slugs = ALL_DEFINITIONS.map((definition) => definition.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    // These are static routes; a category slug colliding with one would be
    // shadowed and unreachable.
    for (const reserved of ['setup', 'unlock', 'recover', 'vault', 'signin', 'auth']) {
      expect(slugs).not.toContain(reserved);
    }
  });

  it('uses each table exactly once', () => {
    const tables = EVERY.map((definition) => definition.table);
    expect(new Set(tables).size, `duplicate table: ${tables.join(', ')}`).toBe(tables.length);
  });
});

describe('every definition, parent or child', () => {
  it.each(EVERY.map((definition) => [definition.table, definition] as const))(
    '%s holds together',
    (table, definition) => {
      // A sealed title renders a list of dots.
      const title = definition.fields.find((field) => field.name === definition.titleField);
      expect(title?.secret, `${table} title is secret`).toBeFalsy();

      const subtitle = definition.fields.find((field) => field.name === definition.subtitleField);
      expect(subtitle?.secret, `${table} subtitle is secret`).toBeFalsy();

      // Hints exist to make a list readable without decrypting; on a plain
      // field one would just duplicate the column.
      for (const field of definition.fields) {
        if (field.hintColumn) expect(field.secret, `${table}.${field.name}`).toBe(true);
      }

      // Every field is editable somewhere.
      const names = definition.fields.map((field) => field.name);
      expect(new Set(names).size, `${table} duplicate fields`).toBe(names.length);

      // Something has to be visible before "Add more details" is pressed.
      const core = definition.fields.filter((field) => (field.group ?? 'more') === 'core');
      expect(core.length, `${table} has no core fields`).toBeGreaterThan(0);

      // A select backed by a database enum must offer choices.
      for (const field of definition.fields) {
        if (field.kind === 'select' || field.kind === 'combo') {
          expect(field.options?.length, `${table}.${field.name} options`).toBeGreaterThan(0);
        }
      }

      // Nothing sealed may leak into a list query.
      const sealed = definition.fields.filter((field) => field.secret).map((field) => field.name);
      for (const column of listSelection(definition)) {
        expect(sealed, `${table} list selects a sealed column`).not.toContain(column);
      }
    },
  );
});

describe('child sections', () => {
  it('declares a parent column on every child', () => {
    for (const child of [...CHILD_DEFINITIONS, ...MORE_CHILD_DEFINITIONS]) {
      expect(child.parentColumn, `${child.table} parentColumn`).toBeDefined();
    }
  });

  it('reaches every child through exactly one parent', () => {
    const attached = ALL_DEFINITIONS.flatMap((definition) =>
      (definition.children ?? []).map((section) => section.definition.table),
    );

    for (const child of [...CHILD_DEFINITIONS, ...MORE_CHILD_DEFINITIONS]) {
      const times = attached.filter((table) => table === child.table).length;
      expect(times, `${child.table} is attached ${times} times`).toBe(1);
    }
  });

  it('summarises a child without crashing on a blank one', () => {
    for (const definition of ALL_DEFINITIONS) {
      for (const section of definition.children ?? []) {
        const blank = Object.fromEntries(
          section.definition.fields.map((field) => [field.name, '']),
        );
        // A child is created empty and opened, so the summary runs against
        // nothing at all before anything is typed.
        expect(() => section.summarize(blank)).not.toThrow();
        expect(typeof section.summarize(blank)).toBe('string');
      }
    }
  });
});
