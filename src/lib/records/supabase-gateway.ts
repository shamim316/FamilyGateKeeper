/**
 * The production RecordGateway.
 *
 * As with the key store, every query leans on row-level security instead of
 * filtering by hand. `get` and `update` do not carry a family id because the
 * policies already scope them; adding a redundant client-side filter would mask
 * a broken policy rather than reveal it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { RecordGatewayError, type RecordGateway, type Row, type RowFilter } from './gateway';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export class SupabaseRecordGateway implements RecordGateway {
  private client: Client | null = null;

  constructor(private readonly createSupabaseClient: () => Client) {}

  private get supabase(): Client {
    this.client ??= this.createSupabaseClient();
    return this.client;
  }

  async list(
    table: string,
    familyId: string,
    columns: string[],
    filter?: RowFilter,
  ): Promise<Row[]> {
    let query = this.supabase.from(table).select(columns.join(', ')).eq('family_id', familyId);

    for (const [column, value] of Object.entries(filter ?? {})) {
      query = query.eq(column, value);
    }

    const { data, error } = await query;

    if (error) throw new RecordGatewayError(`Could not load ${table}`, { cause: error });
    // The column list is built at runtime from a definition, so PostgREST's
    // generated types cannot narrow the result and infer an error shape.
    return (data ?? []) as unknown as Row[];
  }

  async get(table: string, id: string, columns: string[]): Promise<Row | null> {
    const { data, error } = await this.supabase
      .from(table)
      .select(columns.join(', '))
      .eq('id', id)
      .maybeSingle();

    if (error) throw new RecordGatewayError(`Could not load this record`, { cause: error });
    return (data as Row | null) ?? null;
  }

  async insert(table: string, row: Row): Promise<void> {
    const { error } = await this.supabase.from(table).insert(row);
    if (error) throw new RecordGatewayError('Could not save this record', { cause: error });
  }

  async update(table: string, id: string, patch: Row): Promise<void> {
    const { error } = await this.supabase.from(table).update(patch).eq('id', id);
    if (error) throw new RecordGatewayError('Could not save your change', { cause: error });
  }

  async remove(table: string, id: string): Promise<void> {
    const { error } = await this.supabase.from(table).delete().eq('id', id);
    if (error) throw new RecordGatewayError('Could not delete this record', { cause: error });
  }
}
