# Deploying to Easypanel — keeper.akhtar.app

About 20 minutes, most of it waiting for DNS and the first build.

The image takes **no build arguments**. Everything is read from the environment
at request time, so setting a variable in Easypanel's Environment tab is enough
and rotating a key never needs a rebuild.

---

## 1. DNS

Point the subdomain at your VPS before anything else — Let's Encrypt cannot
issue a certificate until it resolves.

| Type | Name | Value |
|---|---|---|
| `A` | `keeper` | your VPS's IPv4 address |

If you use Cloudflare, set the record to **DNS only** (grey cloud) for the first
issuance. You can turn the proxy back on afterwards.

Check it has propagated:

```bash
dig +short keeper.akhtar.app
```

---

## 2. Create the service

In Easypanel: **Project → + Service → App**.

- **Name:** `keeper`
- **Source:** GitHub → `shamim316/FamilyGateKeeper`
- **Branch:** whichever you deploy from
- **Build method:** **Dockerfile** (not Nixpacks — the repo has a `Dockerfile`
  that produces a much smaller image)
- **Dockerfile path:** `Dockerfile`

Leave build arguments empty. There are none.

---

## 3. Environment

**Environment** tab. These are read at request time, so a change here needs only
a restart, not a rebuild:

```
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your anon key>
SITE_URL=https://keeper.akhtar.app
NODE_ENV=production
```

Both values come from Supabase → **Project Settings → API**.

> Use the public key — labelled **anon** on older projects and **publishable**
> (`sb_publishable_…`) on newer ones. Never the **service_role** or **secret**
> key: those bypass row-level security entirely, and in the browser would let any
> visitor read every family's records.
>
> The public key is meant to be public. It ships in the client bundle of every
> Supabase app, and the policies are what protect the data.

Nothing else is needed yet. `RESEND_API_KEY` and the Stripe variables belong to
features that do not exist.

---

## 4. Domain and TLS

**Domains** tab → **Add Domain**:

- **Host:** `keeper.akhtar.app`
- **Port:** `3000`
- **HTTPS:** on
- **Certificate:** Let's Encrypt

Easypanel issues the certificate once DNS resolves. If it fails, it is almost
always DNS not having propagated, or a Cloudflare proxy in the way.

---

## 5. Tell Supabase about the domain

This is the step that is easy to forget and produces a confusing failure: the
magic link will simply refuse to come back.

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://keeper.akhtar.app`
- **Redirect URLs:** add both
  - `https://keeper.akhtar.app/**`
  - `http://localhost:3000/**` — keep this so local development still works

---

## 6. Deploy

Press **Deploy** and watch the log. The build runs `npm ci` and `next build`;
two to four minutes on a modest VPS is normal.

A successful build ends with the route table and `Generating static pages`.

---

## 7. Check it

```bash
curl -sI https://keeper.akhtar.app | head -1
```

`HTTP/2 200` means it is up. Then open it in a browser and confirm the landing
page renders.

**The most useful check is in the browser console:**

```js
window.__FGK_CONFIG__
```

You should see your Supabase URL and anon key. If it is `null`, the environment
variables did not reach the container — check the Environment tab and restart.
This one line separates "misconfigured" from "broken", and is worth doing before
anything else.

---

## 8. Walk through the app

Follow [`VERIFY.md`](VERIFY.md) from step 5, substituting
`https://keeper.akhtar.app` for `http://localhost:3000`. In short:

1. **Get started**, enter your email, open the link **in the same browser**
2. Create a family and a passphrase — watch that the page stays responsive
   during the pause, which is the crypto worker doing its job
3. Save the recovery code and answer the challenge
4. On `/vault`, run **Check the round trip**
5. Add a contact with an account number
6. Back in the Supabase SQL editor, run
   [`supabase/tests/encryption-audit.sql`](../supabase/tests/encryption-audit.sql)
   and confirm the stored value is ciphertext

Step 6 is the one worth doing carefully. Everything else can be re-run; that is
the one that proves the product's central claim on real infrastructure.

---

## Deploying again

Easypanel rebuilds on push if you enable **Auto Deploy**, or use the **Deploy**
button. Because the image carries no configuration, a redeploy cannot change
behaviour by picking up different build-time values — a class of bug this setup
removes rather than manages.

---

## If something goes wrong

| Symptom | Cause |
|---|---|
| `window.__FGK_CONFIG__` is `null` | Environment variables not set, or the container was not restarted after setting them |
| "Supabase is not configured" on screen | Same |
| Certificate will not issue | DNS not propagated, or Cloudflare proxy on. Grey-cloud it, reissue, re-enable |
| Magic link goes to `localhost` | `Site URL` in Supabase still points at localhost. Step 5 |
| "Could not create your family" | Fixed. The insert read the new row back with RETURNING, which triggers the SELECT policy before the ownership trigger has run |
| Redirected to `0.0.0.0:3000` after sign-in | Fixed. Behind a proxy the container only sees its own bind address, so redirects have to come from `SITE_URL` or the `X-Forwarded-*` headers rather than the request. Make sure `SITE_URL` is set |
| Redirected to `/signin?error=link-expired` | Link opened in a different browser or device, or `keeper.akhtar.app/**` missing from Redirect URLs |
| `502` from Easypanel | Container not listening. Check the port is `3000` and the log for a crash |
| Build fails on `npm ci` | `package-lock.json` out of step with `package.json`. Run `npm install` locally and commit the lockfile |
| Blank page, console shows a worker error | The crypto worker chunk did not load — worth reporting, it would be a real bug |

---

## A note on what is deployed

This has a working vault, thirteen categories, and encryption verified end to
end — but no reminders, no emergency screen, no document upload, no multi-member
families, and no billing. It is a real deployment of an unfinished product.

Treat the data as disposable until member invitations exist, because today a
vault belongs to exactly one account, and losing both the passphrase and the
recovery code loses it for good.
