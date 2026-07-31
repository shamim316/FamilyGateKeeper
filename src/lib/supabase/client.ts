import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

/**
 * Browser Supabase client.
 *
 * Everything the app reads and writes goes through this, under the signed-in
 * user's own row-level security. Secret values are sealed before they reach it
 * and opened after they come back — see src/lib/crypto.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
