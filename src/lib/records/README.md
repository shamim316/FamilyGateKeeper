# Records

A record type is a declaration, not a screen.

A `RecordDefinition` names a table, marks which of its fields are secret, and labels each one. From
that single object the app derives the list screen, the detail form, the encryption, the database
mapping, and the route. Adding a category means writing a definition.

```ts
export const contactsDefinition: RecordDefinition = {
  table: 'contacts',
  slug: 'contacts',
  titleField: 'name',
  fields: [
    { name: 'name', label: 'Name', kind: 'text', group: 'core' },
    { name: 'account_number', label: 'Account number', kind: 'text',
      secret: true, hintColumn: 'account_number_hint', group: 'more' },
  ],
};
```

## The one flag that matters

`secret: true` is the line between a value the server can read and one it cannot. It is declared
next to the label rather than chosen by a form component, and it is enforced in
`repository.ts` — below every screen, so no form can write a secret in the clear even by mistake.

Secrets carry an optional `hintColumn`, a plaintext `••••4821`. That is what lets a list of two
hundred contacts render without two hundred key unwrappings: `listSelection()` never selects a
sealed column, only tier-0 fields and hints.

## Layers

| File | Does |
|---|---|
| `definition.ts` | The shape of a record type, and value conversion between form and Postgres |
| `definitions.ts` | The three real ones: contacts, policies, financial accounts |
| `gateway.ts` | Raw row access. Knows nothing about encryption — sealing has already happened |
| `repository.ts` | Seals on the way out, opens on the way back |
| `autosave.ts` | Debounced saving with no save button |
| `use-records.ts` | React hooks over the above |

`memory-gateway.ts` mirrors `MemoryKeyStore`: it exists so the whole stack, including real
encryption, can be tested without a network or a Supabase project.

## Autosave

Forms have no Save button. Editing writes as you go, which is right for forms filled in a field at a
time over months — and it puts the entire burden of not losing work on `AutosaveEngine`. Three rules
follow:

- **A failed save keeps its patch.** Dropping it would discard something the user watched
  themselves type.
- **Newer edits win over a retried older one**, so retrying cannot resurrect a value since changed.
- **One write in flight at a time**, so two overlapping saves cannot land out of order.

Timers are injected, so the tests run a minute of typing in a millisecond.

## Money

Stored as integer cents in `*_cents` columns. Floating-point dollars quietly lose a penny somewhere
between the form and a mortgage balance.

## Blank means null

An empty field is written as `NULL`, not `''`. Otherwise "has no phone number" and "nobody has
filled this in yet" become indistinguishable — and the second is the one a completeness meter and a
"last verified" nudge need to see.

## Tests

- `repository.test.ts` — sealing, hints, AAD field binding, list-without-decrypting, value conversion
- `autosave.test.ts` — coalescing, failure retention, retry ordering, overlapping saves
- `record-flow.test.tsx` — the real screens, driven with real crypto against the memory gateway
- `schema-drift.test.ts` — reads the migrations and fails if a definition names a column that does
  not exist. Without a live database, this is what catches a typo that would otherwise surface as a
  runtime insert failure.

```bash
npm test
```
