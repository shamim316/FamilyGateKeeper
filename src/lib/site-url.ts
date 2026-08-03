/**
 * Working out the address the browser actually used.
 *
 * Behind a reverse proxy — Easypanel, Traefik, nginx, a load balancer — the
 * container never sees the public hostname. It sees the address it was told to
 * bind to, which in the Dockerfile is 0.0.0.0:3000. So `request.url` and
 * `request.nextUrl` both carry `0.0.0.0:3000`, and any redirect built from them
 * sends the visitor to an address that exists only inside the container.
 *
 * That is not a hypothetical: it is what broke the first real magic-link
 * sign-in, which landed on https://0.0.0.0:3000/vault.
 *
 * Order of preference:
 *
 *   1. SITE_URL, when configured. Explicit, and immune to header spoofing.
 *   2. The X-Forwarded-* headers the proxy sets. Available even where
 *      environment variables are not, such as middleware.
 *   3. The request's own origin, which is correct in local development and the
 *      only thing left otherwise.
 */

const FORWARDED_HOST = 'x-forwarded-host';
const FORWARDED_PROTO = 'x-forwarded-proto';

function normalise(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed === '') return null;

  try {
    const url = new URL(trimmed);
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * `SITE_URL` is read where it is available. Next inlines `process.env` for the
 * Edge runtime at build time, so in middleware this is usually absent and the
 * forwarded headers do the work instead.
 */
function fromEnvironment(): string | null {
  const configured = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  return configured ? normalise(configured) : null;
}

function fromForwardedHeaders(headers: Headers): string | null {
  const host = headers.get(FORWARDED_HOST);
  if (!host) return null;

  // A comma-separated list means the request passed through more than one
  // proxy; the first entry is the one the browser used.
  const firstHost = host.split(',')[0].trim();
  if (firstHost === '') return null;

  const proto = (headers.get(FORWARDED_PROTO) ?? 'https').split(',')[0].trim();
  return normalise(`${proto}://${firstHost}`);
}

export function resolveSiteOrigin(request: Request): string {
  return (
    fromEnvironment() ??
    fromForwardedHeaders(request.headers) ??
    new URL(request.url).origin
  );
}

/**
 * Builds an absolute URL on the public origin.
 *
 * `path` is treated as a path on this site and never as somewhere else to go: a
 * protocol-relative `//evil.example` would otherwise turn an internal redirect
 * into an open one.
 */
export function siteUrl(request: Request, path: string): string {
  const origin = resolveSiteOrigin(request);
  const safePath = path.startsWith('/') && !path.startsWith('//') ? path : '/';
  return `${origin}${safePath}`;
}
