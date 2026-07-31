import { describe, expect, it, beforeEach } from 'vitest';
import { generateDek } from '@/lib/crypto/keys';
import { isSealedEnvelope } from '@/lib/crypto/envelope';
import { MemoryRecordGateway } from './memory-gateway';
import { RecordRepository, emptyValues } from './repository';
import { contactsDefinition, policiesDefinition, accountsDefinition } from './definitions';
import { householdMembersDefinition, vehiclesDefinition } from './core-definitions';
import { listSelection, maskedHint, toDbValue, fromDbValue } from './definition';
import type { FieldSpec } from './definition';

const FAMILY = 'family-1';

/** The service-history child, reached through the vehicle that owns it. */
function serviceRecordsDefinitionFor() {
  return vehiclesDefinition.children![0].definition;
}

let gateway: MemoryRecordGateway;
let repository: RecordRepository;
let dek: CryptoKey;

beforeEach(async () => {
  gateway = new MemoryRecordGateway();
  dek = (await generateDek()).key;
  repository = new RecordRepository(gateway, dek);
});

describe('creating a record', () => {
  it('round-trips both plain and secret fields', async () => {
    const created = await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Riverside Plumbing',
      category: 'Plumber',
      phone: '555-0100',
      account_number: '000123456789',
    });

    const loaded = await repository.load(contactsDefinition, created.id);
    expect(loaded?.values.name).toBe('Riverside Plumbing');
    expect(loaded?.values.phone).toBe('555-0100');
    expect(loaded?.values.account_number).toBe('000123456789');
  });

  it('seals the secret and leaves the rest readable', async () => {
    await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Riverside Plumbing',
      account_number: '000123456789',
    });

    const [row] = gateway.rawRows('contacts');

    // This is the product's central claim, asserted at the layer every form
    // will go through.
    expect(gateway.everythingStored()).not.toContain('000123456789');
    expect(isSealedEnvelope(row.account_number)).toBe(true);

    // Tier 0 stays readable so lists and reminders keep working.
    expect(row.name).toBe('Riverside Plumbing');
  });

  it('stores a masked hint so a list reads well before unlocking', async () => {
    await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Riverside Plumbing',
      account_number: '000123456789',
    });

    const [row] = gateway.rawRows('contacts');
    expect(row.account_number_hint).toBe('••••6789');
  });

  it('binds each ciphertext to its own row and column', async () => {
    const first = await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'First',
      account_number: '1111',
    });
    const second = await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Second',
      account_number: '2222',
    });

    const rows = gateway.rawRows('contacts');
    const firstRow = rows.find((row) => row.id === first.id)!;
    const secondRow = rows.find((row) => row.id === second.id)!;

    // Moving a sealed value onto another row must not decrypt: the AAD names
    // the row it belongs to.
    await gateway.update('contacts', second.id, { account_number: firstRow.account_number });
    await expect(repository.load(contactsDefinition, second.id)).rejects.toThrow(
      /wrong key or altered data/i,
    );

    expect(secondRow.account_number).not.toEqual(firstRow.account_number);
  });

  it('fills NOT NULL enums the user never touched', async () => {
    await repository.create(policiesDefinition, FAMILY, {
      ...emptyValues(policiesDefinition),
      label: 'Health plan',
    });

    const [row] = gateway.rawRows('policies');
    expect(row.policy_type).toBe('other');
  });

  it('does not override a choice the user did make', async () => {
    await repository.create(accountsDefinition, FAMILY, {
      ...emptyValues(accountsDefinition),
      nickname: 'Joint checking',
      account_type: 'checking',
    });

    const [row] = gateway.rawRows('financial_accounts');
    expect(row.account_type).toBe('checking');
  });

  it('writes nothing for a field left blank', async () => {
    await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Just a name',
    });

    const [row] = gateway.rawRows('contacts');
    // Null rather than empty string, so "no phone" and "nobody filled this in"
    // stay distinguishable.
    expect(row.phone).toBeNull();
    expect(row.account_number).toBeNull();
    expect(row.account_number_hint).toBeNull();
  });
});

describe('updating a record', () => {
  it('saves a single changed field without touching the others', async () => {
    const created = await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Riverside Plumbing',
      phone: '555-0100',
      account_number: '000123456789',
    });

    await repository.update(contactsDefinition, created.id, created.cek, {
      phone: '555-0199',
    });

    const loaded = await repository.load(contactsDefinition, created.id);
    expect(loaded?.values.phone).toBe('555-0199');
    expect(loaded?.values.name).toBe('Riverside Plumbing');
    expect(loaded?.values.account_number).toBe('000123456789');
  });

  it('re-seals a changed secret and refreshes its hint', async () => {
    const created = await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Riverside Plumbing',
      account_number: '000123456789',
    });

    await repository.update(contactsDefinition, created.id, created.cek, {
      account_number: '999888777666',
    });

    const loaded = await repository.load(contactsDefinition, created.id);
    expect(loaded?.values.account_number).toBe('999888777666');

    const [row] = gateway.rawRows('contacts');
    expect(row.account_number_hint).toBe('••••7666');
    expect(gateway.everythingStored()).not.toContain('999888777666');
  });

  it('clears a secret and its hint together', async () => {
    const created = await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Riverside Plumbing',
      account_number: '000123456789',
    });

    await repository.update(contactsDefinition, created.id, created.cek, {
      account_number: '',
    });

    const [row] = gateway.rawRows('contacts');
    // A stale hint would keep advertising four digits of a number that is gone.
    expect(row.account_number).toBeNull();
    expect(row.account_number_hint).toBeNull();
  });

  it('ignores keys that are not fields of this record', async () => {
    const created = await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Riverside Plumbing',
    });

    await repository.update(contactsDefinition, created.id, created.cek, {
      family_id: 'somebody-elses-family',
      name: 'Renamed',
    } as never);

    const [row] = gateway.rawRows('contacts');
    expect(row.family_id).toBe(FAMILY);
    expect(row.name).toBe('Renamed');
  });
});

describe('listing records', () => {
  it('reads a list without opening any envelope', async () => {
    await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Riverside Plumbing',
      category: 'Plumber',
      account_number: '000123456789',
    });

    // A repository with no usable key still renders the list, which proves the
    // list path never decrypts. Two hundred contacts should not mean two
    // hundred key unwrappings.
    const keyless = new RecordRepository(gateway, (await generateDek()).key);
    const summaries = await keyless.list(contactsDefinition, FAMILY);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].title).toBe('Riverside Plumbing');
    expect(summaries[0].subtitle).toBe('Plumber');
    expect(summaries[0].row.account_number_hint).toBe('••••6789');
  });

  it('never selects a sealed column for a list', () => {
    const columns = listSelection(contactsDefinition);
    expect(columns).toContain('account_number_hint');
    expect(columns).not.toContain('account_number');

    expect(listSelection(policiesDefinition)).not.toContain('policy_number');
    expect(listSelection(accountsDefinition)).not.toContain('routing_number');
  });

  it('shows only this family', async () => {
    await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Ours',
    });
    await repository.create(contactsDefinition, 'another-family', {
      ...emptyValues(contactsDefinition),
      name: 'Theirs',
    });

    const summaries = await repository.list(contactsDefinition, FAMILY);
    expect(summaries.map((summary) => summary.title)).toEqual(['Ours']);
  });

  it('sorts by title so a long list is scannable', async () => {
    for (const name of ['Zeta Roofing', 'Alpha Plumbing', 'Mid Electric']) {
      await repository.create(contactsDefinition, FAMILY, {
        ...emptyValues(contactsDefinition),
        name,
      });
    }

    const summaries = await repository.list(contactsDefinition, FAMILY);
    expect(summaries.map((summary) => summary.title)).toEqual([
      'Alpha Plumbing',
      'Mid Electric',
      'Zeta Roofing',
    ]);
  });
});

describe('deleting', () => {
  it('removes the record', async () => {
    const created = await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Riverside Plumbing',
    });

    await repository.remove(contactsDefinition, created.id);
    expect(await repository.load(contactsDefinition, created.id)).toBeNull();
  });
});

describe('a wrong key', () => {
  it('cannot read another family key holder\'s secrets', async () => {
    const created = await repository.create(contactsDefinition, FAMILY, {
      ...emptyValues(contactsDefinition),
      name: 'Riverside Plumbing',
      account_number: '000123456789',
    });

    const stranger = new RecordRepository(gateway, (await generateDek()).key);
    await expect(stranger.load(contactsDefinition, created.id)).rejects.toThrow(
      /wrong key or altered data/i,
    );
  });
});

describe('converting values for the database', () => {
  const money: FieldSpec = { name: 'premium_cents', label: 'Premium', kind: 'money' };
  const number: FieldSpec = { name: 'payment_due_day', label: 'Due day', kind: 'number' };
  const text: FieldSpec = { name: 'name', label: 'Name', kind: 'text' };

  it('stores money as integer cents', () => {
    // Floating point dollars lose a penny somewhere between here and a
    // mortgage balance.
    expect(toDbValue(money, '1234.56')).toBe(123456);
    expect(toDbValue(money, '$1,234.56')).toBe(123456);
    expect(toDbValue(money, '0.07')).toBe(7);
    expect(toDbValue(money, '100')).toBe(10000);
  });

  it('reads money back as dollars', () => {
    expect(fromDbValue(money, 123456)).toBe('1234.56');
    expect(fromDbValue(money, 7)).toBe('0.07');
  });

  it('turns blanks into null rather than empty strings', () => {
    expect(toDbValue(text, '')).toBeNull();
    expect(toDbValue(text, '   ')).toBeNull();
    expect(toDbValue(money, '')).toBeNull();
    expect(toDbValue(number, '')).toBeNull();
  });

  it('trims what people paste in', () => {
    expect(toDbValue(text, '  Riverside Plumbing  ')).toBe('Riverside Plumbing');
  });

  it('survives nonsense in a number field', () => {
    expect(toDbValue(money, 'abc')).toBeNull();
    expect(toDbValue(number, 'abc')).toBeNull();
  });

  it('masks a secret down to its last four', () => {
    expect(maskedHint('000123456789')).toBe('••••6789');
    expect(maskedHint('4417')).toBe('••••');
    expect(maskedHint('12')).toBe('••');
    expect(maskedHint('')).toBeNull();
  });
});

describe('every definition', () => {
  it('names a title field that is not secret', () => {
    for (const definition of [contactsDefinition, policiesDefinition, accountsDefinition]) {
      const title = definition.fields.find((field) => field.name === definition.titleField);
      expect(title, `${definition.slug} title field`).toBeDefined();
      // A sealed title would render a list of dots.
      expect(title?.secret, `${definition.slug} title field`).toBeFalsy();
    }
  });

  it('names a subtitle field that is not secret', () => {
    for (const definition of [contactsDefinition, policiesDefinition, accountsDefinition]) {
      if (!definition.subtitleField) continue;
      const subtitle = definition.fields.find(
        (field) => field.name === definition.subtitleField,
      );
      expect(subtitle?.secret, `${definition.slug} subtitle field`).toBeFalsy();
    }
  });

  it('only puts hint columns on secret fields', () => {
    for (const definition of [contactsDefinition, policiesDefinition, accountsDefinition]) {
      for (const field of definition.fields) {
        if (field.hintColumn) {
          expect(field.secret, `${definition.slug}.${field.name}`).toBe(true);
        }
      }
    }
  });

  it('gives every field a unique column', () => {
    for (const definition of [contactsDefinition, policiesDefinition, accountsDefinition]) {
      const names = definition.fields.map((field) => field.name);
      expect(new Set(names).size, definition.slug).toBe(names.length);
    }
  });
});

describe('creating an empty record, the way the Add button does', () => {
  it('writes something for every column the database insists on', async () => {
    // The create flow inserts a blank row and opens it, so a NOT NULL column
    // left as null fails the very first insert against real Postgres. The
    // in-memory gateway does not enforce that, which is why schema-drift.test
    // checks the constraint and this checks the value that lands.
    //
    // Only fields marked required are asserted. A title can be genuinely
    // nullable — policies.label is — and the list falls back to "Untitled".
    for (const definition of [
      contactsDefinition,
      policiesDefinition,
      accountsDefinition,
      householdMembersDefinition,
      vehiclesDefinition,
    ]) {
      const store = new MemoryRecordGateway();
      const repo = new RecordRepository(store, dek);

      await repo.create(definition, FAMILY, emptyValues(definition));
      const [row] = store.rawRows(definition.table);

      for (const field of definition.fields.filter((candidate) => candidate.required)) {
        expect(row[field.name], `${definition.table}.${field.name}`).not.toBeNull();
        expect(row[field.name], `${definition.table}.${field.name}`).not.toBeUndefined();
      }

      for (const column of Object.keys(definition.createDefaults ?? {})) {
        expect(row[column], `${definition.table}.${column}`).not.toBeNull();
      }
    }
  });

  it('leaves a blank required field readable as empty, not as a placeholder', async () => {
    const created = await repository.create(
      contactsDefinition,
      FAMILY,
      emptyValues(contactsDefinition),
    );

    // Empty string, not "Untitled" — the form should open blank and the list
    // decides how to label a nameless record.
    const [row] = gateway.rawRows('contacts');
    expect(row.name).toBe('');

    const loaded = await repository.load(contactsDefinition, created.id);
    expect(loaded?.values.name).toBe('');
  });

  it('still writes null for a blank optional field', async () => {
    await repository.create(contactsDefinition, FAMILY, emptyValues(contactsDefinition));
    const [row] = gateway.rawRows('contacts');
    expect(row.phone).toBeNull();
  });
});

describe('child records', () => {
  it('links a child to its parent and lists it back', async () => {
    const vehicle = await repository.create(vehiclesDefinition, FAMILY, {
      ...emptyValues(vehiclesDefinition),
      nickname: "Mom's Honda",
    });

    const service = serviceRecordsDefinitionFor();
    await repository.create(
      service,
      FAMILY,
      { ...emptyValues(service), service_type: 'Oil change' },
      vehicle.id,
    );

    const [row] = gateway.rawRows('vehicle_service_records');
    expect(row.vehicle_id).toBe(vehicle.id);

    const listed = await repository.list(service, FAMILY, vehicle.id);
    expect(listed.map((entry) => entry.title)).toEqual(['Oil change']);
  });

  it('does not mix one parent\'s children into another\'s', async () => {
    const service = serviceRecordsDefinitionFor();

    const first = await repository.create(vehiclesDefinition, FAMILY, {
      ...emptyValues(vehiclesDefinition),
      nickname: 'First',
    });
    const second = await repository.create(vehiclesDefinition, FAMILY, {
      ...emptyValues(vehiclesDefinition),
      nickname: 'Second',
    });

    await repository.create(
      service,
      FAMILY,
      { ...emptyValues(service), service_type: 'Belongs to first' },
      first.id,
    );

    expect(await repository.list(service, FAMILY, second.id)).toEqual([]);
    expect((await repository.list(service, FAMILY, first.id)).length).toBe(1);
  });

  it('fills a NOT NULL date default at the moment of creation', async () => {
    const service = serviceRecordsDefinitionFor();
    const vehicle = await repository.create(vehiclesDefinition, FAMILY, {
      ...emptyValues(vehiclesDefinition),
      nickname: 'Car',
    });

    await repository.create(service, FAMILY, emptyValues(service), vehicle.id);

    const [row] = gateway.rawRows('vehicle_service_records');
    // A date column cannot take an empty string, so this one defaults to today.
    expect(row.serviced_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('works on a table that has no content key at all', async () => {
    const service = serviceRecordsDefinitionFor();
    const vehicle = await repository.create(vehiclesDefinition, FAMILY, {
      ...emptyValues(vehiclesDefinition),
      nickname: 'Car',
    });

    const created = await repository.create(
      service,
      FAMILY,
      { ...emptyValues(service), service_type: 'Brakes', vendor_name: 'Riverside' },
      vehicle.id,
    );

    expect(created.cek).toBeNull();
    const [row] = gateway.rawRows('vehicle_service_records');
    expect(row.wrapped_cek).toBeUndefined();

    const loaded = await repository.load(service, created.id);
    expect(loaded?.values.service_type).toBe('Brakes');
    expect(loaded?.cek).toBeNull();
  });

  it('still seals a child that does have secrets', async () => {
    const person = await repository.create(householdMembersDefinition, FAMILY, {
      ...emptyValues(householdMembersDefinition),
      display_name: 'Dana',
    });

    const ids = householdMembersDefinition.children![0].definition;
    await repository.create(
      ids,
      FAMILY,
      { ...emptyValues(ids), label: 'Passport', document_number: 'X1234567' },
      person.id,
    );

    expect(gateway.everythingStored()).not.toContain('X1234567');
    const [row] = gateway.rawRows('member_identifications');
    expect(row.document_number_hint).toBe('••••4567');
  });
});

describe('a secret on a table with no content key', () => {
  it('refuses rather than quietly writing plaintext', async () => {
    const broken = {
      ...serviceRecordsDefinitionFor(),
      fields: [{ name: 'service_type', label: 'Type', kind: 'text' as const, secret: true }],
    };

    await expect(
      repository.create(broken, FAMILY, { service_type: 'secret' }),
    ).rejects.toThrow(/marked secret but the record has no content key/);
  });
});
