/**
 * Raw table access, one level below encryption.
 *
 * A gateway moves rows. It knows nothing about which columns are secret — by
 * the time a row reaches it, the sealing has already happened — so an
 * implementation that logged everything it saw would leak nothing but labels
 * and dates.
 *
 * Same reasoning as KeyStore: the interface exists so the repository above it
 * can be tested against real crypto and a real definition without a network.
 */

export type Row = Record<string, unknown>;

/** Narrows a list to one parent's children, e.g. `{ vehicle_id: '…' }`. */
export type RowFilter = Record<string, string>;

export interface RecordGateway {
  list(
    table: string,
    familyId: string,
    columns: string[],
    filter?: RowFilter,
  ): Promise<Row[]>;

  get(table: string, id: string, columns: string[]): Promise<Row | null>;

  insert(table: string, row: Row): Promise<void>;

  update(table: string, id: string, patch: Row): Promise<void>;

  remove(table: string, id: string): Promise<void>;
}

export class RecordGatewayError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RecordGatewayError';
  }
}
