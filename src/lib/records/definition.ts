/**
 * What a record type is, declared once and used everywhere.
 *
 * A definition says which table a record lives in, which of its fields are
 * secret, and how each one should be labelled and edited. From that, the list
 * screen, the detail form, the encryption, and the database mapping all follow
 * — which is what makes adding a category a matter of writing a definition
 * rather than another screen.
 *
 * The one thing a definition must get right is `secret`. That flag is the line
 * between a value the server can read and one it cannot, so it is declared
 * next to the label rather than buried in a form component.
 */

/** A value as Postgres stores it. */
export type DbValue = string | number | boolean | null;

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'phone'
  | 'email'
  | 'url'
  | 'date'
  | 'money'
  | 'number'
  /** A fixed set, backed by a database enum. */
  | 'select'
  /** Suggestions with free text underneath — "pick one or type your own". */
  | 'combo'
  | 'boolean';

export interface FieldSpec {
  /** Column name, in the database's snake_case. */
  name: string;
  label: string;
  kind: FieldKind;

  /**
   * Tier 1. Sealed in the browser; the server stores an opaque envelope.
   * Everything without this is tier 0 and stays readable, which is what lets
   * lists render and renewal reminders be sent without an unlocked vault.
   */
  secret?: boolean;

  /**
   * Plaintext column holding a masked form of a secret — "••••4821". Lets a
   * list be useful before anything is decrypted.
   */
  hintColumn?: string;

  /**
   * `core` fields are always visible. `more` sits behind "Add more details",
   * because a form showing forty inputs at once is a form nobody finishes.
   */
  group?: 'core' | 'more';

  /**
   * The column is NOT NULL in the schema.
   *
   * Records are created empty and opened immediately, so a blank required
   * column is written as an empty string rather than NULL — which satisfies the
   * constraint while still reading as "nothing here yet" in the UI. Without
   * this the very first insert of every record type fails.
   */
  required?: boolean;

  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
}

export interface RecordDefinition {
  /** Table name in `public`. */
  table: string;
  /** Route segment, e.g. `contacts` in /contacts/:id. */
  slug: string;

  singular: string;
  plural: string;
  /** Shown on an empty list, in plain language. */
  emptyMessage: string;

  /** Column used as the record's title. Always tier 0. */
  titleField: string;
  /** Optional second line on a list card. Must be tier 0. */
  subtitleField?: string;

  fields: FieldSpec[];

  /**
   * Values written on creation for NOT NULL columns the user has not filled in
   * yet. The product promise is that only a name is ever required, so an enum
   * the database insists on needs a sensible starting point rather than a
   * required field on the form.
   */
  createDefaults?: Record<string, DbValue | (() => DbValue)>;

  /**
   * Whether rows carry their own `wrapped_cek`. True for anything with a secret
   * field; false for the few child tables that hold nothing worth sealing, such
   * as paint colours. The schema-drift test keeps this honest against the
   * actual columns.
   */
  contentKey?: boolean;

  /**
   * Set on a child definition: the column pointing at its parent, e.g.
   * `vehicle_id` on a service record.
   */
  parentColumn?: string;

  /** Collections shown beneath this record's own form. */
  children?: ChildSection[];

  /** Columns to select for the list view. Derived, but overridable. */
  listColumns?: string[];
}

/**
 * A one-to-many collection under a record — a vehicle's service history, a
 * person's ID documents, a property's appliances.
 *
 * The child is an ordinary RecordDefinition with `parentColumn` set, so it gets
 * the same field specs, sealing, and autosave as anything else. Only the way it
 * is listed and created differs.
 */
export interface ChildSection {
  definition: RecordDefinition;
  title: string;
  /** Shown when the collection is empty. */
  emptyMessage: string;
  addLabel: string;
  /** Builds the one-line summary shown on a collapsed child. */
  summarize: (values: FormValues) => string;
}

export function usesContentKey(definition: RecordDefinition): boolean {
  return definition.contentKey ?? true;
}

/** Resolves createDefaults, calling any thunks — a date default means today. */
export function resolveCreateDefaults(definition: RecordDefinition): Record<string, DbValue> {
  const resolved: Record<string, DbValue> = {};
  for (const [column, value] of Object.entries(definition.createDefaults ?? {})) {
    resolved[column] = typeof value === 'function' ? value() : value;
  }
  return resolved;
}

export function secretFields(definition: RecordDefinition): FieldSpec[] {
  return definition.fields.filter((field) => field.secret);
}

export function plainFields(definition: RecordDefinition): FieldSpec[] {
  return definition.fields.filter((field) => !field.secret);
}

export function fieldByName(definition: RecordDefinition, name: string): FieldSpec | undefined {
  return definition.fields.find((field) => field.name === name);
}

/**
 * Columns safe to read without unwrapping anything: the tier-0 fields plus any
 * hint columns. A list of two hundred contacts should not mean two hundred key
 * unwrappings.
 */
export function listSelection(definition: RecordDefinition): string[] {
  if (definition.listColumns) return definition.listColumns;

  const columns = new Set<string>(['id', 'updated_at']);
  columns.add(definition.titleField);
  if (definition.subtitleField) columns.add(definition.subtitleField);
  if (definition.parentColumn) columns.add(definition.parentColumn);

  for (const field of definition.fields) {
    if (!field.secret) columns.add(field.name);
    if (field.hintColumn) columns.add(field.hintColumn);
  }

  return [...columns];
}

// ---------------------------------------------------------------------------
// Converting between what a form holds and what Postgres stores
// ---------------------------------------------------------------------------

/** Form values are strings, or booleans for checkboxes. */
export type FormValue = string | boolean;
export type FormValues = Record<string, FormValue>;

export function toDbValue(field: FieldSpec, value: FormValue): DbValue {
  if (typeof value === 'boolean') return value;

  const trimmed = value.trim();
  // An empty field means "not recorded", which is null rather than an empty
  // string — otherwise "has no phone number" and "nobody has filled this in"
  // become indistinguishable. NOT NULL columns are the exception; they take an
  // empty string, which reads the same way but satisfies the constraint.
  if (trimmed === '') return field.required ? '' : null;

  switch (field.kind) {
    case 'money': {
      // Stored as integer cents. Floating point dollars would quietly lose a
      // penny somewhere between here and a mortgage balance.
      const cleaned = trimmed.replace(/[^0-9.-]/g, '');
      const amount = Number.parseFloat(cleaned);
      return Number.isFinite(amount) ? Math.round(amount * 100) : null;
    }
    case 'number': {
      const parsed = Number.parseInt(trimmed.replace(/[^0-9-]/g, ''), 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    default:
      return trimmed;
  }
}

export function fromDbValue(field: FieldSpec, value: DbValue): FormValue {
  if (field.kind === 'boolean') return value === true;
  if (value === null || value === undefined) return '';

  if (field.kind === 'money' && typeof value === 'number') {
    return (value / 100).toFixed(2);
  }

  return String(value);
}

/** The `*_cents` convention: a money field's column carries the suffix. */
export function isMoneyColumn(name: string): boolean {
  return name.endsWith('_cents');
}

/** Builds the masked hint stored alongside a secret. */
export function maskedHint(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length <= 4) return '•'.repeat(trimmed.length);
  return `••••${trimmed.slice(-4)}`;
}
