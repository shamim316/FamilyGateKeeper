/**
 * Database types.
 *
 * Placeholder until the schema is generated from a live project:
 *
 *   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
 *
 * Generating rather than hand-writing matters here — the schema has thirty-odd
 * tables and a hand-maintained copy drifts silently, which in this app means a
 * column that should hold a sealed envelope quietly typed as a string.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/** An AES-GCM envelope as stored in an `app.sealed` column. */
export interface Sealed {
  v: number;
  alg: 'A256GCM';
  iv: string;
  ct: string;
  aad?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
