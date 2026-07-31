# Encryption

Every secret value in Family Gate Keeper passes through this module and nowhere else.

## What is encrypted, and what isn't

Encrypting everything sounds safer and makes the product worse: search stops working, lists show
rows of dots, and the server can no longer tell you your registration expires in three weeks. So
fields are assigned a tier.

| Tier | Examples | Storage |
|---|---|---|
| **0 — Plain** | Names, dates, vendor names, phone numbers, addresses, model numbers, expiration dates | Ordinary columns, indexed and searchable |
| **1 — Secret** | SSNs, passport and license numbers, account and card numbers, PINs, alarm and garage codes, WiFi passwords, safe combinations | `SealedEnvelope` — AES-256-GCM, opaque to the server |
| **2 — Files** | Document scans, insurance card photos | Encrypted before upload to Supabase Storage |

Tier 1 fields carry a plaintext **display hint** next to the ciphertext (`•••• 4821`, or "Chase —
Joint Checking") so a list is useful before the vault is unlocked.

The dividing line: if the server needs it to render a list or send a reminder, it is tier 0. If
seeing it would let someone impersonate the family, it is tier 1.

## Key hierarchy

```
passphrase ──Argon2id──► KEK ─┐
recovery code ──HKDF────────► ├─unwraps──► family DEK ──unwraps──► record CEK ──► field ciphertext
device passkey ─────────────► ┘
```

**Family DEK** — one random 256-bit key per family, generated in the browser at signup. It is
wrapped three independent ways. Each wrapping is a separate path back to the data, and the DEK
itself never changes, so adding or removing a path re-encrypts nothing.

**Record CEK** — one key per record, wrapped under the DEK. This costs an extra row per record and
is what makes it possible to share a single record with another family without handing over the
DEK. Retrofitting it later would mean re-encrypting every row in the database, so it exists from
the first commit.

**Extractability** — `unwrapDek` returns a non-extractable `CryptoKey` by default, so an XSS payload
can use the key during the session but cannot exfiltrate it. Key management (inviting a member,
rotating a recovery code) needs the raw bytes and must pass `{ extractable: true }`, which keeps
those call sites easy to find and audit.

## Envelope format

```jsonc
{
  "v": 1,
  "alg": "A256GCM",
  "iv": "base64url",
  "ct": "base64url",          // ciphertext with GCM tag
  "aad": "fgk/v1/household_members/<id>/ssn"
}
```

The envelope is self-describing, so the format can change without a migration that would have to
decrypt data the server cannot read.

The `aad` binds a ciphertext to one field of one record. Without it, someone with write access to
the database could copy a sealed SSN from one member's row into another's and the client would
happily decrypt it under the wrong name. With it, the move fails to open.

## Invites and sharing

Both cases hand key material to someone who is not online, and both use a sealed box — ephemeral
X25519 keypair, ECDH against the recipient's public key, HKDF to an AES-GCM key:

- **Inviting a family member** re-wraps the family DEK for the new member's public key. No shared
  secret has to travel over email.
- **Sharing with another family** re-wraps one record's CEK. Exactly one record moves; the DEK
  never does; revoking is deleting a row.

Context strings (`CONTEXT.memberInvite`, `CONTEXT.recordShare`) keep an envelope minted for one
purpose from being replayed as the other.

## Argon2id parameters

Currently m=32 MiB, t=2, p=1 — above the OWASP floor of m=19 MiB, t=2, p=1, and about a second on a
laptop with this pure-JS implementation. Call it three seconds on a mid-range phone, which is the
ceiling of what a cold unlock can cost before the app feels broken.

That ceiling is why repeat unlocks on a trusted device go through the passkey path and never touch
Argon2 at all. Swapping in a WASM implementation would buy roughly a 10x speedup and room to raise
the parameters; because they travel with each wrapped key, that change needs no migration.

## What this does not protect against

Worth being honest about, because the marketing will be tempted to overclaim:

- **A malicious or compromised server.** The app is delivered as JavaScript from our origin. Anyone
  who can change what we serve can serve a build that exfiltrates the passphrase. Client-side
  encryption defends against a stolen database, a subpoena, and a curious operator — not against a
  compromised deployment pipeline.
- **A compromised device.** A keylogger or a malicious extension reads the passphrase as it is
  typed.
- **Losing every credential.** If the passphrase, the recovery code, and every registered device are
  gone, so is the data. There is no reset. Onboarding must say this in plain words and make the
  user acknowledge it.
- **Metadata.** The server sees how many vehicles a family has, when records were last touched, and
  every tier-0 field. That is the deliberate trade that keeps the app usable.

## Tests

`crypto.test.ts` covers round-trips, wrong-key and tampering rejection, AAD field binding, recovery
code typo tolerance, member invites, single-record sharing, and — the one that proves the central
product claim — that no plaintext survives in the row a service-role query would return.

```bash
npm test
```
