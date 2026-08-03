# Verifying against a real Supabase project

Everything so far has been tested against an in-memory stand-in. This walks the
whole stack against a live project for the first time — and it has already
caught one thing (see [Known issues](#known-issues-found-while-writing-this)).

Roughly 20 minutes. Do it in order; each step assumes the one before it worked.

---

## 1. Point the repo at your project

Set the project reference in `supabase/config.toml`. It is the string in your
dashboard URL, `https://supabase.com/dashboard/project/`**`<this bit>`**:

```toml
project_id = "abcdefghijklmnop"
```

Then create your local environment file:

```bash
cp .env.example .env.local
```

Fill in the two values from **Project Settings → API**:

| Variable | Where |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Project API keys — the **anon**/**public** key on older projects, the **publishable** key (`sb_publishable_…`) on newer ones. Both are public by design. |

Leave everything else blank; nothing later in this document needs it.

> Do **not** put the `service_role` key in any variable starting with
> `NEXT_PUBLIC_`. That prefix compiles the value into the browser bundle, and
> the service role bypasses row-level security entirely. `npm run preflight`
> fails if it finds one.

---

## 2. Apply the migrations

**If your GitHub integration watches a branch:** push this branch, or merge it
into the branch the integration watches. The five files in
`supabase/migrations/` run in order.

**Otherwise, from the CLI:**

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
```

`supabase/tests/` is not a migration directory and will not be applied — it
contains the local shim and the RLS suite, which are for a throwaway database
only.

Expect five migrations:

| File | What it creates |
|---|---|
| `0001_foundation` | Families, membership, key storage, the RLS predicates |
| `0002_shared_records` | Contacts, policies, financial accounts, attachments |
| `0003_domain_records` | The thirteen category tables and their children |
| `0004_reminders_sharing_security` | Reminders, sharing, audit log, all the policies |
| `0005_api_grants` | Table privileges for `authenticated`; nothing for `anon` |

Three of these end with a check that raises an exception rather than shipping a
table with no row-level security, no policies, or no grants. If a migration
fails with `Tables without row-level security: …`, that is the guard working —
do not bypass it.

---

## 3. Set up Auth

**Authentication → URL Configuration:**

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/**`

Without these an emailed link bounces and you never reach `/auth/callback`.

**Authentication → Providers → Email:**

- **Confirm email: off.**

This one matters more than it looks. With it on, creating an account sends a
confirmation message, and a project on Supabase's built-in mail server gets only
a handful of messages an hour before every attempt fails with **email rate limit
exceeded**. With it off, signing up returns a session immediately and **no email
is sent at all** — which is the point: nothing about getting into the app should
depend on mail delivery.

The setting also lives in [`supabase/config.toml`](../supabase/config.toml) as
`enable_confirmations = false`, but the dashboard is what the hosted project
actually reads unless you are pushing config with the CLI. Set it in both.

What you give up is proof that the address belongs to whoever typed it. That
costs nothing here: the vault is opened by a passphrase this server never sees,
so an unverified address cannot reach anybody's data. Turn confirmations back on
once you have configured real SMTP under **Project Settings → Auth → SMTP**.

---

## 4. Check the project

Two ways, depending on whether you want to install anything.

### Nothing installed — the SQL editor

Open **SQL Editor** in the Supabase dashboard, paste the whole of
[`supabase/tests/health-check.sql`](../supabase/tests/health-check.sql), and run
it. Thirteen rows come back, each `ok` or `FAIL`, naming the migration to apply
when something is missing. It is read-only.

This covers the schema, the row-level security, and the grants — the parts most
likely to be wrong, and the parts that found the bug below.

### With Node — the full preflight

```bash
npm install
npm run preflight
```

Everything the SQL check does, plus the environment file, that the project
answers over HTTPS, and that an anonymous REST request sees nothing.

Either way, do not continue until it is clean.

---

## 5. Sign in

**Deployed** (see [DEPLOY-EASYPANEL.md](DEPLOY-EASYPANEL.md)): open your domain,
e.g. `https://keeper.akhtar.app`. Everything from here on is identical; just
substitute your domain wherever this says `localhost:3000`.

**Locally:**

```bash
npm run dev
```

Then open `http://localhost:3000`.

Click **Get started**, then **Create an account instead**. Enter an email address
and a password of at least ten characters.

With *Confirm email* off (step 3) this sends no mail at all. You are signed in
the moment the form submits and should land on `/setup`.

> **The password you type here is not the vault passphrase**, and the next
> screen will refuse to let you use the same string for both. The password is
> stored on Supabase's server as a hash it can check; the passphrase must be
> something no server can check. If they were the same, whoever took the auth
> database would hold the key to the vault, and the encryption would be
> decoration. The setup screen compares them and blocks a match.

**Emailed links still exist** as a fallback — *Email me a link instead* and
*I have forgotten my password*, both on the sign-in screen. Both go through
`/auth/callback` and both are subject to that rate limit. If you use one, open
it **on the same device and browser**: sign-in uses PKCE and the verifier lives
in a cookie there, so opening the link on your phone fails with `link-expired`.

---

## 6. Create the vault

Enter a family name and a passphrase (at least 10 characters). Use a throwaway
one you will not mind losing.

**Watch for a pause of one to three seconds** after pressing *Create my vault*.
That is Argon2id deriving the key, and it is supposed to be slow. What matters
is that **the page stays responsive** while it happens — that is the Web Worker
doing its job. A frozen tab means the worker did not load.

Then the recovery kit. Note the code, tick the box, and type back the group it
asks for. Continue lands you on `/vault`.

---

## 7. Prove the encryption

This is the step that matters. On `/vault`, use **Check the round trip**:

1. Leave the secret as `4417` (or type anything).
2. Press **Store it, read it back, decrypt it**.

Two panels appear. In **What the server stored** you should see something like:

```json
{
  "name": "Round-trip check",
  "account_number": {
    "v": 1, "alg": "A256GCM",
    "iv": "…", "ct": "…"
  },
  "account_number_hint": "••••4417"
}
```

Check three things:

- `account_number` is an envelope, and **your value appears nowhere in it**
- `name` and the hint **are** readable — that is deliberate, and it is what
  lets lists render and reminders send without an unlocked vault
- **Decrypted correctly** shows the value you typed

Then confirm it independently: open **Table Editor → contacts** in the Supabase
dashboard while the panel is on screen. The row is deleted after the check runs,
so to see it persisted, use a real contact instead — step 8.

---

## 8. Use it as a person would

Go to `/vault` → **Contacts** → *Add your first contact*.

- Type a name. Move to another field. Within a second, **Saved** appears —
  there is no save button anywhere, by design.
- Press **Add more details**, put something in **Account number**, and tab away.
- Note the field is masked, and has **Show** and **Copy** beside it.
- Go back to **Contacts**. The card shows the name and `••••` plus the last four
  digits — rendered without decrypting anything.
- Open it again. The account number is there in full.

Now the part that proves the whole design. Either look at **Table Editor →
contacts** in the dashboard, or — better — run
[`supabase/tests/encryption-audit.sql`](../supabase/tests/encryption-audit.sql)
in the SQL editor:

```
what                          status   rows  what is actually stored
Secret columns in the schema   29 columns can hold a secret; 2 currently do
contacts.account_number        sealed      1  {"v":1,"ct":"dGhpcy1pcy…","alg":"A256GCM"}
household_members.ssn          sealed      1  {"v":1,"ct":"c3NuLWNpcGhl…","alg":"A256GCM"}
Plaintext is rejected          yes — the app.sealed domain refuses anything else
Readable on purpose            contact names     1  Riverside Plumbing
Readable on purpose            masked hints      1  ••••6789
```

It finds every secret column by itself, so it stays accurate as the schema
grows. **You cannot read your own users' secrets, and neither can anyone who
steals this database.**

Finally, the lock:

- Back in the app, press **Lock**, then hard-reload the page.
- You are sent to `/unlock`. Enter the wrong passphrase — it should say so
  plainly rather than mentioning decryption.
- Enter the right one. Your contact is still there and still decrypts.

---

## 9. Try a child collection

`/vault` → **Vehicles** → add one → **Log a service** under *Service history*.

The date should default to today. Type what was done, then collapse the entry —
it becomes a one-line summary. This is the pattern behind ID documents,
appliances, doctors, and schools.

---

## What "verified" means after this

| Verified | Still not |
|---|---|
| Migrations apply to real Postgres | Reminders (not built) |
| RLS and grants behave as the local suite claims | Emergency screen (not built) |
| Password sign-in, and the PKCE callback | Encrypted document upload (not built) |
| Argon2id in a worker, on a real browser | Multi-member families and sharing |
| Secrets stored as ciphertext, end to end | Billing |
| Autosave, masking, child records | Anything on a phone, or offline |

Once this passes, the honest statement changes from "tested against a
stand-in" to "the foundation works," and Documents becomes buildable — it needs
Storage, which has no stand-in.

---

## Known issues found while writing this

**Redirects pointed at the container.** The magic link came back to
`https://0.0.0.0:3000/vault`. Behind a reverse proxy the container never sees
the public hostname — `request.url` carries the address it was told to bind to —
so every redirect built from it was wrong. Redirects now resolve the public
origin from `SITE_URL`, falling back to the `X-Forwarded-*` headers.

**Sign-in was unusable after a few attempts.** *Email rate limit exceeded.* The
product had deliberately been magic-link only, on the reasoning that one secret
is better than two — but that made every sign-in depend on mail delivery, and
Supabase's built-in sender allows only a handful of messages an hour. The
original decision traded a real, permanent dependency for a wording problem.
Email and password sign-in is now the primary path and sends nothing; links
remain as a fallback. The two-secrets confusion the original choice was avoiding
is handled where it actually bites: the setup screen refuses a vault passphrase
equal to the account password, since a passphrase the auth server can verify is
not end-to-end encryption at all.

**A family could not be created.** "Could not create your family" on the setup
screen. The insert used `RETURNING` to read the new row back, which makes
Postgres apply the SELECT policy — and that policy requires membership, which is
created by an AFTER trigger that has not fired yet. The creator could not see
their own family. The id is now generated client-side and nothing is returned.
The RLS suite had used a plain insert and so never exercised the statement the
app actually sends; it now asserts both shapes.

**The middleware had never run.** Next only picks up `middleware.ts` beside the
`app` directory. This project uses `src/app`, so it had to be
`src/middleware.ts`; at the repo root it was silently ignored. The auth guard
and, more consequentially, the Supabase session refresh had been absent since
they were written, with no failing test and nothing in the build output. CI now
fails if the middleware manifest is empty.



**Missing table grants.** The migrations created tables and row-level security
policies but never granted `authenticated` any privilege on them. Supabase's
project bootstrap sets default privileges that would have covered it, so this
might have worked by luck — and would have granted `anon` too, which this app
never wants. `0005_api_grants.sql` now does it explicitly, and the local RLS
suite no longer grants privileges itself, so it fails if that migration is ever
missing. This was invisible until a real project existed, because the local test
was quietly papering over it.

---

## If something goes wrong

| Symptom | Cause |
|---|---|
| `relation "public.families" does not exist` | Migrations not applied. Step 2. |
| `permission denied for table …` | `0005_api_grants.sql` not applied. |
| Redirected to `/signin?error=link-expired` | Link opened in a different browser or device, or already used. |
| **Email rate limit exceeded** | Supabase's built-in mail server, a handful of messages an hour. Turn **Confirm email** off (step 3) and sign in with a password — that path sends nothing. For the link and reset flows, configure SMTP. |
| Sign-up says an email was sent | *Confirm email* is still on in the dashboard. Step 3. |
| Emailed link never arrives | Same rate limit. Add SMTP, or send from **Authentication → Users**. |
| "This is your sign-in password" on `/setup` | Working as intended — the vault needs a different secret. Pick another. |
| Tab freezes on *Create my vault* | The crypto worker did not load. Check the console for a worker error. |
| "Supabase is not configured" on screen | Locally: `.env.local` was added after `npm run dev` started — restart it. Deployed: check `window.__FGK_CONFIG__` in the console; if it is `null`, the environment variables never reached the container. |
| Stuck on "Opening…" | Vault locked, or the session expired. Hard-reload and unlock. |

Anything not on this list is worth reporting rather than working around — it
would be the first genuine finding from real infrastructure.
