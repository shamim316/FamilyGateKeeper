#!/usr/bin/env node
/**
 * Checks a live Supabase project before anyone opens the app.
 *
 * The point is to separate "the project is not wired up" from "the app is
 * broken". Every failure here prints what to change and where, because the
 * alternative is a blank screen and a console error that means nothing.
 *
 *   npm run preflight
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

// ---------------------------------------------------------------------------

let failures = 0;
let warnings = 0;

function ok(message, detail) {
  console.log(`  ✓ ${message}${detail ? `  ${dim(detail)}` : ''}`);
}

function fail(message, fix) {
  failures += 1;
  console.log(`  ✗ ${message}`);
  if (fix) console.log(`     ${fix.split('\n').join('\n     ')}`);
}

function warn(message, detail) {
  warnings += 1;
  console.log(`  ! ${message}`);
  if (detail) console.log(`     ${detail.split('\n').join('\n     ')}`);
}

function dim(text) {
  return `[2m${text}[0m`;
}

function heading(text) {
  console.log(`\n${text}`);
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function loadEnv() {
  // Deliberately not using a dotenv dependency: this script has to run before
  // anyone has confidence the install is right.
  for (const file of ['.env.local', '.env']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  }
}

loadEnv();

heading('Configuration');

// Unprefixed names are what production uses; the NEXT_PUBLIC_ ones still work.
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!existsSync(join(root, '.env.local'))) {
  fail(
    '.env.local is missing',
    'cp .env.example .env.local, then fill in SUPABASE_URL and SUPABASE_ANON_KEY\n' +
      'from Supabase → Project Settings → API.',
  );
}

if (!url) {
  fail('SUPABASE_URL is not set', 'Supabase → Project Settings → API → Project URL');
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) {
  warn(`SUPABASE_URL looks unusual: ${url}`, 'Expected https://<ref>.supabase.co');
} else {
  ok('SUPABASE_URL', url);
}

if (!anonKey) {
  fail('SUPABASE_ANON_KEY is not set', 'Supabase → Project Settings → API → anon key');
} else if (anonKey.length < 40) {
  fail('SUPABASE_ANON_KEY looks too short to be a real key');
} else {
  ok('SUPABASE_ANON_KEY', `${anonKey.slice(0, 12)}…`);
}

// The service role key bypasses row-level security. It must never be readable
// by the browser, so a NEXT_PUBLIC_ prefix on it is a serious mistake.
for (const name of Object.keys(process.env)) {
  if (name.startsWith('NEXT_PUBLIC_') && /SERVICE_ROLE|SECRET/i.test(name)) {
    fail(
      `${name} is exposed to the browser`,
      'Anything prefixed NEXT_PUBLIC_ is compiled into the client bundle.\n' +
        'Rename it without the prefix.',
    );
  }
}

if (failures > 0) {
  console.log('\nFix the above, then run this again.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Reachability and schema
// ---------------------------------------------------------------------------

const restHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

async function restGet(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: restHeaders });
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Some responses are empty; the status is what matters.
  }
  return { status: response.status, body };
}

heading('Connection');

try {
  const response = await fetch(`${url}/auth/v1/health`, { headers: restHeaders });
  if (response.ok) {
    ok('Auth service is reachable');
  } else {
    fail(`Auth service returned ${response.status}`, 'Check the project is not paused.');
  }
} catch (error) {
  fail(`Cannot reach ${url}`, `${error.message}\nCheck the URL and that the project is running.`);
  console.log('');
  process.exit(1);
}

heading('Schema');

// One table from each migration, so a partial apply is obvious.
const TABLES = [
  ['families', '0001_foundation'],
  ['member_key_wrappings', '0001_foundation'],
  ['contacts', '0002_shared_records'],
  ['policies', '0002_shared_records'],
  ['household_members', '0003_domain_records'],
  ['vehicles', '0003_domain_records'],
  ['properties', '0003_domain_records'],
  ['pets', '0003_domain_records'],
  ['reminders', '0004_reminders_sharing_security'],
];

let missing = 0;
let denied = 0;

for (const [table, migration] of TABLES) {
  const { status, body } = await restGet(`${table}?select=id&limit=1`);
  const code = body?.code ?? '';

  if (status === 200) {
    ok(`${table} is present and reachable`);
  } else if (code === '42P01' || status === 404) {
    missing += 1;
    fail(`${table} does not exist`, `Migration ${migration}.sql has not been applied.`);
  } else if (code === '42501' || status === 403) {
    denied += 1;
    fail(
      `${table} exists but the API role cannot read it`,
      'Migration 0005_api_grants.sql has not been applied.',
    );
  } else {
    fail(`${table} returned ${status}`, JSON.stringify(body));
  }
}

if (missing > 0) {
  console.log(
    `\n  ${missing} table(s) missing. Apply the migrations:\n` +
      '     supabase link --project-ref <ref>\n' +
      '     supabase db push\n' +
      '  or push to the branch your GitHub integration watches.',
  );
}

if (denied === 0 && missing === 0) {
  heading('Row-level security');

  // Anonymous requests must come back empty, never with somebody's rows. An
  // empty array here is the correct and only acceptable answer.
  const { status, body } = await restGet('families?select=id');
  if (status === 200 && Array.isArray(body) && body.length === 0) {
    ok('An anonymous request sees no families');
  } else if (Array.isArray(body) && body.length > 0) {
    fail(
      `An anonymous request returned ${body.length} row(s)`,
      'Row-level security is not doing its job. Do not put real data in this project.',
    );
  } else {
    ok('An anonymous request is refused', `status ${status}`);
  }
}

// ---------------------------------------------------------------------------

heading(failures === 0 ? 'Ready' : 'Not ready');

if (failures === 0) {
  console.log(
    `  Schema and permissions look right${warnings > 0 ? ` (${warnings} warning(s))` : ''}.\n` +
      '  Next: set the Auth redirect URLs, then npm run dev and follow docs/VERIFY.md.\n',
  );
} else {
  console.log(`  ${failures} problem(s) above.\n`);
  process.exit(1);
}
