import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site-url';

/**
 * Where an emailed link lands — a sign-in link or a password reset.
 *
 * Exchanges the one-time code for a session cookie, then sends the visitor on
 * to the vault. What they see there depends on whether this account has keys
 * yet, which only the client can determine — so the redirect is always to
 * /vault and the client routes onward from there.
 *
 * Every redirect goes through `siteUrl`, never `request.url`. Behind a proxy
 * the latter is the container's own bind address, which sent the first real
 * sign-in to https://0.0.0.0:3000/vault.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/vault';

  if (!code) {
    return NextResponse.redirect(siteUrl(request, '/signin?error=missing-code'));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Almost always an expired or already-used link.
    return NextResponse.redirect(siteUrl(request, '/signin?error=link-expired'));
  }

  // Only same-origin paths, so a crafted link cannot bounce someone off-site
  // carrying a fresh session.
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/vault';
  return NextResponse.redirect(siteUrl(request, destination));
}
