import { afterEach, describe, expect, it } from 'vitest';
import { resolveSiteOrigin, siteUrl } from './site-url';

const originalSiteUrl = process.env.SITE_URL;
const originalPublicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  process.env.SITE_URL = originalSiteUrl;
  process.env.NEXT_PUBLIC_SITE_URL = originalPublicSiteUrl;
  if (originalSiteUrl === undefined) delete process.env.SITE_URL;
  if (originalPublicSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
});

/** A request as it looks inside the container: bound to 0.0.0.0:3000. */
function requestBehindProxy(headers: Record<string, string> = {}) {
  return new Request('http://0.0.0.0:3000/auth/callback?code=abc', { headers });
}

describe('the bug this exists for', () => {
  it('never sends anyone to the container\'s own bind address', () => {
    // The first real magic-link sign-in landed on https://0.0.0.0:3000/vault,
    // because the redirect was built from request.url.
    delete process.env.SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const withProxyHeaders = requestBehindProxy({
      'x-forwarded-host': 'keeper.akhtar.app',
      'x-forwarded-proto': 'https',
    });

    expect(siteUrl(withProxyHeaders, '/vault')).toBe('https://keeper.akhtar.app/vault');
    expect(siteUrl(withProxyHeaders, '/vault')).not.toContain('0.0.0.0');
  });

  it('uses SITE_URL even when the proxy sets nothing', () => {
    process.env.SITE_URL = 'https://keeper.akhtar.app';
    expect(siteUrl(requestBehindProxy(), '/vault')).toBe('https://keeper.akhtar.app/vault');
  });
});

describe('choosing an origin', () => {
  it('prefers SITE_URL over the forwarded headers', () => {
    // Explicit configuration beats a header anyone upstream could set.
    process.env.SITE_URL = 'https://keeper.akhtar.app';

    const origin = resolveSiteOrigin(
      requestBehindProxy({ 'x-forwarded-host': 'attacker.example' }),
    );
    expect(origin).toBe('https://keeper.akhtar.app');
  });

  it('tolerates a trailing slash in SITE_URL', () => {
    process.env.SITE_URL = 'https://keeper.akhtar.app/';
    expect(resolveSiteOrigin(requestBehindProxy())).toBe('https://keeper.akhtar.app');
  });

  it('ignores a SITE_URL that is not a URL', () => {
    process.env.SITE_URL = 'keeper.akhtar.app';
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const origin = resolveSiteOrigin(
      requestBehindProxy({ 'x-forwarded-host': 'keeper.akhtar.app' }),
    );
    expect(origin).toBe('https://keeper.akhtar.app');
  });

  it('falls back to NEXT_PUBLIC_SITE_URL', () => {
    delete process.env.SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://keeper.akhtar.app';
    expect(resolveSiteOrigin(requestBehindProxy())).toBe('https://keeper.akhtar.app');
  });

  it('takes the first host when a request crossed several proxies', () => {
    delete process.env.SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const origin = resolveSiteOrigin(
      requestBehindProxy({
        'x-forwarded-host': 'keeper.akhtar.app, internal.lb',
        'x-forwarded-proto': 'https, http',
      }),
    );
    expect(origin).toBe('https://keeper.akhtar.app');
  });

  it('assumes https when the proxy names a host but no scheme', () => {
    delete process.env.SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const origin = resolveSiteOrigin(requestBehindProxy({ 'x-forwarded-host': 'keeper.akhtar.app' }));
    expect(origin).toBe('https://keeper.akhtar.app');
  });

  it('uses the request itself in local development', () => {
    delete process.env.SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const local = new Request('http://localhost:3000/auth/callback?code=abc');
    expect(resolveSiteOrigin(local)).toBe('http://localhost:3000');
  });
});

describe('building a URL', () => {
  it('keeps the query string on the path', () => {
    process.env.SITE_URL = 'https://keeper.akhtar.app';
    expect(siteUrl(requestBehindProxy(), '/signin?error=link-expired')).toBe(
      'https://keeper.akhtar.app/signin?error=link-expired',
    );
  });

  it('refuses a protocol-relative path', () => {
    process.env.SITE_URL = 'https://keeper.akhtar.app';

    // `//evil.example` in a redirect is an open redirect wearing a path's
    // clothing, and this one would carry a freshly minted session.
    expect(siteUrl(requestBehindProxy(), '//evil.example')).toBe('https://keeper.akhtar.app/');
  });

  it('refuses an absolute URL', () => {
    process.env.SITE_URL = 'https://keeper.akhtar.app';
    expect(siteUrl(requestBehindProxy(), 'https://evil.example/vault')).toBe(
      'https://keeper.akhtar.app/',
    );
  });
});
