import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPublicConfig } from './public-config';
import type { Database } from './types';

/**
 * Server Supabase client, scoped to the signed-in user.
 *
 * This uses the anon key and the user's session, so row-level security still
 * applies. There is deliberately no service-role client here: the service role
 * bypasses RLS, and the only things that legitimately need it are the Stripe
 * webhook and the reminder job, which should each construct their own.
 */
export async function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Middleware refreshes the
          // session instead, so there is nothing to do here.
        }
      },
    },
  });
}
