/**
 * Where the browser gets its Supabase URL and anon key.
 *
 * Next inlines `NEXT_PUBLIC_*` into the bundle at build time, which is wrong
 * for a self-hosted Docker deploy: the image would carry whichever values
 * happened to be present on the build machine, setting them in the host's
 * environment tab would do nothing, and rotating a key would mean a rebuild.
 * The failure is quiet — the bundle just contains `undefined` — and surfaces
 * as a broken sign-in rather than a failed build.
 *
 * So the server reads them at request time and hands them to the page. The
 * same image can then move between environments untouched.
 *
 * The anon key is public by design — it ships in every Supabase app's client
 * bundle, and row-level security, not the key's secrecy, is what protects the
 * data. Putting it in the page is not a leak. The service-role key is the
 * opposite, and never appears here.
 */

export interface PublicConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteUrl: string | null;
}

/** The global the server-rendered page defines for the browser to read. */
export const CONFIG_GLOBAL = '__FGK_CONFIG__';

declare global {
  interface Window {
    [CONFIG_GLOBAL]?: PublicConfig;
  }
}

/**
 * Server-side, from the real environment.
 *
 * Unprefixed names are preferred and are the ones to set in production: Next
 * never inlines them, so they are always read at runtime. The `NEXT_PUBLIC_`
 * spellings stay supported so an existing `.env.local` keeps working.
 */
export function readPublicConfigFromEnv(): PublicConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  return {
    supabaseUrl,
    supabaseAnonKey,
    siteUrl: process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null,
  };
}

export class MissingConfigError extends Error {
  constructor() {
    super(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY ' +
        '(locally, copy .env.example to .env.local).',
    );
    this.name = 'MissingConfigError';
  }
}

/**
 * Whichever side is asking. In the browser this is the value the server put on
 * the page; on the server it is the environment directly.
 */
export function getPublicConfig(): PublicConfig {
  if (typeof window !== 'undefined') {
    const injected = window[CONFIG_GLOBAL];
    if (injected?.supabaseUrl && injected?.supabaseAnonKey) return injected;
    throw new MissingConfigError();
  }

  const fromEnv = readPublicConfigFromEnv();
  if (!fromEnv) throw new MissingConfigError();
  return fromEnv;
}

/**
 * The inline script that carries the config to the browser.
 *
 * JSON.stringify twice: once to build the object, once to make it a string
 * literal the parser cannot escape out of. A `</script>` inside a value would
 * otherwise end the tag early.
 */
export function configScript(config: PublicConfig | null): string {
  if (!config) return `window.${CONFIG_GLOBAL}=null`;
  return `window.${CONFIG_GLOBAL}=JSON.parse(${JSON.stringify(JSON.stringify(config))})`;
}
