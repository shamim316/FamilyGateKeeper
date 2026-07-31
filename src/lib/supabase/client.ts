import { createBrowserClient } from '@supabase/ssr';
import { getPublicConfig } from './public-config';
import type { Database } from './types';

/**
 * Browser Supabase client.
 *
 * Everything the app reads and writes goes through this, under the signed-in
 * user's own row-level security. Secret values are sealed before they reach it
 * and opened after they come back — see src/lib/crypto.
 */
export function createClient() {
  // Runtime, not build time: see ./public-config.ts.
  const { supabaseUrl, supabaseAnonKey } = getPublicConfig();
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
