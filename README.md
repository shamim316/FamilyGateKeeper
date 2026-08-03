# Family Gate Keeper

A private data vault for the information a family needs once a year and needs badly: policy numbers,
account numbers, the garage code, which plumber they used, when the registration expires, the dog's
microchip number.

Secret values are encrypted in the browser before they are sent anywhere. The server stores
ciphertext it cannot read.

## Status

Early development. See [`docs/PLAN.md`](docs/PLAN.md) for the full product and implementation plan,
and [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) for the field-level data model.

Built so far:

- Full Postgres schema with row-level security on every table (`supabase/migrations/`)
- Client-side encryption core with test coverage (`src/lib/crypto/`)
- The vault shell (`src/lib/vault/`, `src/app/`) — email and password sign-in, family creation, the
  recovery-kit ceremony, unlock, recovery, and auto-lock. The account password and the vault
  passphrase are enforced to be different secrets; only the first one ever reaches a server
- The record layer (`src/lib/records/`) — a record type is a declaration, not a screen. All
  thirteen categories run on it, with autosave, no save buttons, and child collections for
  service logs, ID documents, appliances, doctors, and schools.
- Next.js app scaffold and Docker build for Easypanel

Next up: connecting a Supabase project, then encrypted document upload and renewal reminders.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Data | Supabase Cloud — Postgres, Auth, Storage |
| Crypto | WebCrypto AES-GCM + Argon2id, in the browser |
| Deploy | Docker (`output: 'standalone'`) on Easypanel |
| Tests | Vitest (unit + crypto), Playwright (end-to-end) |

## Deploying

[`docs/DEPLOY-EASYPANEL.md`](docs/DEPLOY-EASYPANEL.md) walks through Easypanel and a custom domain.

The image takes no build arguments: Supabase settings are read from the environment at request
time, so the same image runs anywhere and rotating a key needs no rebuild.

## Getting started

```bash
npm install
cp .env.example .env.local   # SUPABASE_URL and SUPABASE_ANON_KEY
npm run dev
```

Apply the database schema with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server on :3000 |
| `npm run build` | Production build (standalone output) |
| `npm test` | Vitest — crypto, ceremonies, session, and component suites |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:db` | Applies the migrations to a throwaway database and runs the RLS suite |
| `npm run test:e2e` | Playwright. Skips itself unless a live Supabase project is configured |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Security model

Three tiers, assigned per field:

- **Tier 0 (plaintext)** — names, dates, vendor names, phone numbers, expiration dates. Stored in
  ordinary columns so lists render, search works, and renewal reminders can be sent server-side
  without the server ever seeing a secret.
- **Tier 1 (encrypted)** — SSNs, passport and license numbers, account and card numbers, PINs,
  alarm and garage codes, WiFi passwords, safe combinations. AES-GCM sealed in the browser.
- **Tier 2 (encrypted files)** — document scans and insurance card photos, encrypted before upload.

Keys are layered: a passphrase-derived KEK unwraps a per-family DEK, which unwraps a per-record CEK,
which decrypts the field. The DEK is independently wrapped by a printable recovery code, so losing a
passphrase is survivable — losing both is not, and onboarding says so plainly.

Argon2id runs in a Web Worker. That keeps a one-to-three second derivation off the main thread, and
it means the passphrase and raw key bytes never exist there at all: what comes back is a
non-extractable `CryptoKey` the page can use but cannot read.

See `src/lib/crypto/README.md` for the threat model, including what this does *not* protect against.
