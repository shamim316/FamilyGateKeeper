/**
 * An in-memory RecordGateway for tests.
 *
 * Like MemoryKeyStore, it round-trips through JSON and hands back copies, so a
 * test cannot pass by holding a live reference to something the "database"
 * stores. It also keeps every row it was given, which is what lets a test
 * assert that no plaintext ever reached it.
 */

import type { RecordGateway, Row } from './gateway';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pick(row: Row, columns: string[]): Row {
  const selected: Row = {};
  for (const column of columns) {
    if (column in row) selected[column] = row[column];
  }
  return selected;
}

export class MemoryRecordGateway implements RecordGateway {
  private tables = new Map<string, Row[]>();

  private rowsFor(table: string): Row[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  async list(table: string, familyId: string, columns: string[]): Promise<Row[]> {
    return this.rowsFor(table)
      .filter((row) => row.family_id === familyId)
      .map((row) => clone(pick(row, columns)));
  }

  async get(table: string, id: string, columns: string[]): Promise<Row | null> {
    const row = this.rowsFor(table).find((candidate) => candidate.id === id);
    return row ? clone(pick(row, columns)) : null;
  }

  async insert(table: string, row: Row): Promise<void> {
    this.rowsFor(table).push(clone(row));
  }

  async update(table: string, id: string, patch: Row): Promise<void> {
    const rows = this.rowsFor(table);
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) throw new Error(`No row ${id} in ${table}`);
    rows[index] = { ...rows[index], ...clone(patch) };
  }

  async remove(table: string, id: string): Promise<void> {
    const rows = this.rowsFor(table);
    const index = rows.findIndex((row) => row.id === id);
    if (index !== -1) rows.splice(index, 1);
  }

  /** Everything ever stored, as one JSON string, for leak assertions. */
  everythingStored(): string {
    return JSON.stringify([...this.tables.entries()]);
  }

  rawRows(table: string): Row[] {
    return clone(this.rowsFor(table));
  }
}
