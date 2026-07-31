# Family Gate Keeper — Product & Implementation Plan

## Context

Family Gate Keeper (familygatekeeper.com) is a private data vault where a family records the
information they only need once a year but need *badly* when they need it: policy numbers, account
numbers, the garage code, which plumber they used, when the registration expires, the dog's
microchip number. Today that information lives in a drawer, a spouse's memory, and three different
password managers, and it is effectively unavailable during the exact moments — a hospital
admission, a burst pipe, a death in the family — when it matters most.

The repository is currently empty (`/home/user/FamilyGateKeeper`, branch
`claude/family-gate-keeper-planning-dmpjyf`, no commits). This plan covers the whole product:
recommended data model additions, the encryption architecture, the UI approach, the billing tiers,
and the build order.

**Decisions already made:**

| Decision | Choice |
|---|---|
| Encryption | Hybrid — client-side E2E on secret values, plaintext on labels/dates |
| Hosting | Supabase Cloud for data; Next.js app on the Easypanel VPS |
| Platform | Next.js PWA, mobile-first, installable |
| Scope | All nine categories in the first build |

**The central design tension:** a vault that is genuinely secure is usually painful to use, and a
vault that is painful to use stays empty. An empty vault has no value at all. Every decision below
resolves in favor of "the family will actually fill this in."

---

## Part 1 — Field Recommendations

Your list is a strong skeleton. The additions below fall into three buckets: **fields that are
missing but obvious** (a house with no street address), **fields that unlock the app's real value**
(expiration dates, which power reminders), and **fields people frantically search for during an
emergency** (water shutoff location, microchip number, emergency vet).

### Household Members

The most consequential gap: you record ID *numbers* but not their *expiration dates*. Expiration
dates are what turn a filing cabinet into a product that emails you in August about the passport
you need in October.

Add: preferred name; relationship to head of household; phone; email; photo; place of birth;
citizenship; blood type; height, weight, eye color (forms, and missing-person reports); employer,
work phone, HR contact; emergency contact outside the household; notes.

Per ID document, add the full set rather than just a number:
- **Driver's license / state ID** — issuing state, issue date, **expiration date**, class, REAL ID compliant (yes/no)
- **Passport** — issuing country, issue date, **expiration date**, place of issue, passport card number
- **Birth certificate** — certificate number, county/state of issue, **physical location of the original**
- **Social Security card** — physical location (store the number encrypted; most people need "where is the card")
- **Known Traveler / Global Entry / TSA PreCheck** — number, expiration
- **Marriage certificate**, **military ID / DD-214**, **immigration documents** (A-number, visa type, green card number, expiration) — as optional document records

### Vehicles

Structural change first: **make maintenance a repeating child record**, not two fields. "Date and
vendor of last maintenance" gets overwritten and loses history; a service log (date, mileage,
service type, vendor, cost, warranty) is what people actually want when selling the car or arguing
with a mechanic.

Add: color, trim, body style; **title number and where the title is physically kept**; lienholder or
lessor (lender, account number, monthly payment, payoff date, lease end date, mileage cap);
**inspection / emissions due date**; purchase date, price, dealer; odometer reading with date; next
service due (date or mileage); **tire size, oil type, battery group size, wiper blade size, key fob
count, key code, spare key location**; toll transponder account; parking permit; preferred repair
shop; roadside assistance provider and phone; insurance agent name and claims phone.

The consumables list (tire size, filter, wiper size) sounds trivial and is one of the highest-use
features in apps like this — it turns the vault into something you open in a store aisle.

### Health (per person)

Add the fields actually printed on an insurance card, which are not the same as "policy number":
**member ID, group number, plan type (PPO/HMO/HDHP), RxBIN, RxPCN, RxGroup, effective date,
deductible, out-of-pocket max, claims phone, nurse line, member portal URL**, and a photo of the
card front and back.

Add clinical fields, which are the emergency-relevant ones: **allergies (drug, food, environmental),
current medications with dose and prescribing doctor, chronic conditions, blood type, immunization
dates, surgeries.** These belong on the emergency screen described in Part 3.

Add providers as a list rather than three fixed slots — people have a cardiologist, a dermatologist,
a therapist, a physical therapist. Each provider: name, specialty, practice, phone, address, portal
URL, medical record number. Plus **preferred pharmacy** (name, phone, address) and **preferred
hospital**.

Expand insurance beyond the four you listed: add **disability**, **long-term care**, and **umbrella**
policies. For life insurance specifically add policy type (term/whole), face amount, **term end
date**, beneficiaries, and agent contact — a term policy quietly expiring is exactly the kind of
thing this app should catch.

### House

The biggest omission: **the street address.** A nickname alone won't do.

Add: full address; own / rent / vacation / rental-property; square footage, lot size, bedrooms,
bathrooms; **parcel / APN number** (needed for tax appeals); deed location; title insurance policy.

**Mortgage & taxes** — lender, loan number, rate, payment, escrow yes/no, payoff date, second
mortgage or HELOC; property tax assessor account, annual amount, due dates, homestead exemption.

**Insurance** — expand to policy number, coverage amount, deductible, agent name and phone,
**claims phone** (different from the sales line, and the one you need at 2am), renewal date. Same
shape for flood, plus umbrella. Add **home warranty** (company, policy, expiration, service phone).

**HOA** — dues amount and frequency, management company, portal URL, board contact, CC&R document.

**Utilities** — add meter number, portal URL, autopay yes/no, average monthly bill, and
**emergency shutoff location** (water main, gas valve, breaker panel). Also add sewer/septic, well,
propane, and solar/battery to the utility list.

**Two entirely new sub-entities under House:**

1. **Appliances & systems** — type, brand, model, serial, purchase date, installed date, warranty
   expiration, **filter size and change interval**, service company, manual URL. Covers HVAC, water
   heater, furnace, washer, dryer, fridge, dishwasher, water softener, sump pump, generator, roof
   (age, material, installer). Filter sizes and warranty dates alone justify the section.
2. **Finishes** — paint colors by room (brand, color name, code, finish, date painted), flooring,
   tile, countertop, cabinet hardware. Perennially requested and never written down.

Also add: **security system** (company, account, monitoring phone, alarm code, duress code, permit
number); smart home devices (locks, thermostat, cameras — brand, app, codes); renovation history
(date, scope, contractor, cost, permit number, warranty); trash and recycling pickup days; spare
key holder; neighbor emergency contact; storage unit; and for renters — landlord, lease start/end,
rent, deposit amount.

Finally, a structural change: **make contractors a reusable directory, not fixed slots per house.**
"Plumber, electrician, landscaper" as fixed fields breaks the moment someone has two plumbers or a
tile guy. See the `contacts` table in Part 2.

### Communication

Add the single most useful missing field in this whole category: the **carrier account PIN /
passcode**. It is required for every support call and every number port, nobody remembers it, and
it is the reason porting a number turns into a two-hour ordeal.

Add: guest WiFi name and password; router brand, model, admin URL, admin password; modem serial;
ISP portal URL and installation date; per-line details for the cell plan (phone number, who uses it,
device model, IMEI, purchase date, protection plan); carrier account number for porting; email
accounts with recovery email and recovery phone; streaming/TV provider; mail forwarding.

### Education (per person)

Add: student ID number; school district; parent portal URL; **bus route number and stop time**;
school hours; counselor, nurse, principal; school calendar link; **authorized pickup persons**
(genuinely important, and schools ask for it); IEP or 504 plan status and case manager; lunch
account number; extracurriculars with coach contacts; tutor or music teacher.

For older students add a college block: FAFSA ID, 529 plan (provider, account, beneficiary),
student loan servicer and account, expected graduation year, advisor.

For younger children add daycare/preschool: provider, tuition, hours, and the **provider tax ID**,
which you need every April for the childcare credit.

### Finances

Add to every account: **routing number** alongside the account number, account nickname, online
banking URL, joint owners, opened date, and **beneficiaries (POD/TOD)** — beneficiary designations
override a will, and almost nobody tracks them.

Credit cards — add last 4, network, expiration, statement close date, **payment due date**, autopay
source, annual fee, rewards program and points balance, and the **international collect-call number
for a lost card** (printed on the back, useless once the card is lost).

Add these accounts to your list: **HSA/FSA**, **401(k) with employer match and vesting schedule**,
**pension**, **529**, brokerage, crypto (exchange, wallet type, and the *location* of the seed
phrase — never the phrase itself), and loans (mortgage, auto, student, personal — servicer, balance,
rate, payoff date).

Two additions with outsized value:
- **Credit freeze PINs** for Equifax, Experian, and TransUnion. Rarely tracked, agonizing to recover.
- **Tax records** — preparer name and contact, where prior returns are stored, **IRS Identity
  Protection PIN**, estimated payment schedule, EIN if self-employed.

Also: safe deposit box (bank, box number, **key location**, authorized signers) and home safe
(location, combination) — both cross-listed under Estate below.

### Subscriptions

Your list is a picker; the useful part is the metadata around it. Add: **cost**, billing frequency,
**renewal date**, **free trial end date**, payment method (linked to a specific credit card record),
account email, **cancellation URL**, shared-with (family plan members), category, and active/cancelled
status. Roll up an annual total.

Free-trial expiry alerts and an annual spend total are the two things that make people open a
subscription tracker twice.

### Pets

The critical omission: **microchip number and registry** — the field that gets a lost pet home, and
the one nobody can find when it matters. Right behind it: **the emergency/after-hours vet**, since
the regular vet is closed at 11pm on a Sunday, which is when pets get sick.

Add: breed, sex, date of birth or adoption date, color and markings, weight, spay/neuter status,
photo; license/tag number; **rabies tag number and expiration**; vaccination dates; vet address and
phone; medications, allergies, conditions; food brand, type, and portion; groomer; boarding/kennel;
walker/sitter.

### New Categories Worth Adding

These are absent from your list and several of them are more valuable than sections you already have.

1. **Emergency / Break Glass** — not a data category so much as a pinned screen assembled from
   everything else: allergies, blood types, medications, emergency contacts, insurance cards, water
   and gas shutoff locations, alarm codes, poison control, non-emergency police, pet microchips.
   Reachable in one tap, printable, and the single best answer to "why would I open this app?"

2. **Estate & Legal** — arguably the reason a product called *Gate Keeper* exists. Will (location,
   attorney, executor), trust (name, trustee), financial power of attorney, healthcare power of
   attorney, living will / advance directive / DNR (location and copies), organ donor status,
   funeral and burial preferences, prepaid arrangements, cemetery plot, and a **digital legacy**
   block: password manager and where the master credential is kept, 2FA recovery code location,
   Apple Legacy Contact, Google Inactive Account Manager, domain registrar.

3. **Documents** — encrypted file attachments on any record (passport scan, deed, title, insurance
   card, will, birth certificate) plus a "physical location of the original" note for each.

4. **Valuables inventory** — jewelry, art, electronics, instruments, firearms: description, serial
   number, purchase date, value, appraisal date, photo. This is what an insurer demands after a fire
   or burglary, and reconstructing it from memory is how people get underpaid on claims.

5. **Memberships** — gym, warehouse clubs, AAA (with the roadside number), museums, alumni
   associations, professional licenses and certifications with **expiration dates** and CE
   requirements.

6. **Travel** — frequent flyer and hotel loyalty numbers, travel insurance, rental car membership,
   trip documents. Naturally cross-links to passports and Known Traveler numbers.

7. **Trusted circle** — babysitters, neighbors with a key, godparents, and the **legal guardians
   designated for minor children**, which belongs next to the will.

### Three Cross-Cutting Fields

Apply these to nearly every record:

- **`expires_on` / renewal date** — the engine behind every reminder. Any field that can expire
  should have one.
- **`last_verified_at`** — vault data rots silently. Showing "verified 14 months ago" and nudging
  for a re-check is what separates a trustworthy vault from a stale one, and it creates a recurring
  reason to open the app.
- **`notes`** and **`attachments`** — a free-text escape hatch and a file slot on everything, so a
  missing field never blocks someone from recording what they know.

---

## Part 2 — Architecture

### Stack

- **Next.js 15** (App Router, TypeScript) — mobile-first PWA, installable, offline-capable
- **Tailwind CSS + shadcn/ui**, with design tokens retuned for larger type and touch targets
- **Supabase Cloud** — Postgres, Auth, Storage, Realtime; RLS enforced on every table
- **TanStack Query** with IndexedDB persistence for the offline read cache
- **react-hook-form + Zod**, schemas shared between client and server
- **Stripe** for billing; **Resend** for reminder email
- **Docker** (Next.js `output: 'standalone'`) deployed on Easypanel
- **Vitest** for units and crypto; **Playwright** for end-to-end flows

Keep the schema and auth portable — plain Postgres plus standard Supabase Auth, no proprietary
extensions — so self-hosting on the VPS stays a live option if cloud costs or positioning change.

### Encryption Model

Three sensitivity tiers, assigned per field:

| Tier | Contents | Storage |
|---|---|---|
| 0 — Plain | Names, nicknames, dates, vendor names, phone numbers, addresses, model numbers, expiration dates | Plaintext columns, indexed and searchable |
| 1 — Secret | SSN, passport/DL numbers, account and card numbers, PINs, garage and alarm codes, WiFi passwords, safe combinations | Client-side AES-GCM, opaque to the server |
| 2 — Files | Document scans, insurance card photos | Client-encrypted before upload to Supabase Storage |

Tier 0 stays readable so lists render, search works, and the server can send renewal reminders
without ever seeing a secret. Tier 1 fields additionally store a **plaintext display hint**
(`•••• 4821`, or a label like "Chase — Joint Checking") so list views are useful before unlock.

**Key hierarchy:**

```
Passphrase ──Argon2id──► KEK ──unwraps──► Family DEK ──unwraps──► per-record CEK ──► field ciphertext
                                    ▲
Recovery code ──HKDF────────────────┤   (second independent wrapping of the DEK)
Device passkey ────────────────────-┘   (device-bound wrapping in IndexedDB, for quick unlock)
```

- One random 256-bit **Family DEK** per family, generated in the browser at signup.
- The DEK is wrapped three ways: by the passphrase-derived KEK, by a printable **recovery code**,
  and optionally per-device behind a passkey for fast re-unlock. Each wrapping is an independent
  path back to the data; losing all of them loses the data, which the onboarding must state plainly
  and force an acknowledgement of.
- Each record gets its own **content encryption key (CEK)**, wrapped by the family DEK. This costs
  one extra row per record now and is the only thing that makes cross-family sharing possible later
  — retrofitting it is brutal, so build it from day one.
- Unlocked DEK is held as a non-extractable `CryptoKey` in memory only, never in `localStorage`, and
  auto-locks after inactivity.
- **Adding a family member:** each user has an X25519 keypair (private key wrapped by their own KEK).
  Inviting a member re-wraps the family DEK for their public key, so the invite works asynchronously
  without a shared secret over email.
- **Sharing with another family:** re-wrap the specific records' CEKs for the recipient family's
  public key. Scoped per record or per category, revocable, and never requires handing over the DEK.

Crypto lives in one audited module (`lib/crypto/`) with a narrow interface — `seal()`, `open()`,
`wrapKey()`, `unwrapKey()` — and heavy unit tests including cross-version decryption. All ciphertext
is stored as a self-describing envelope (`{v, alg, iv, ct}`) so the format can evolve.

### Data Model

Three generic tables absorb most of your list and prevent the schema from ballooning:

- **`contacts`** — one row for every vendor, provider, agent, contractor, doctor, school, bank, or
  vet. Fields: name, category, phone, alt phone, email, address, website, portal URL, account
  number *(secret)*, notes. Everything else references it. This replaces roughly forty repetitions
  of "vendor name, phone, account number," gives you a searchable household directory for free, and
  means the plumber who also did the water heater is one record, not two.
- **`policies`** — every insurance policy of any kind (health, dental, vision, life, disability,
  long-term care, auto, home, flood, umbrella, warranty, pet). They share carrier, policy number
  *(secret)*, group/member ID *(secret)*, phone, claims phone, agent, effective and renewal dates,
  premium, deductible, coverage amount, beneficiaries. A `policy_type` enum and a small `details`
  jsonb cover the per-type extras.
- **`financial_accounts`** — checking, savings, credit card, brokerage, IRA, Roth, 401(k), HSA, 529,
  loan, crypto. Shared shape with an `account_type` enum, secret account and routing numbers, and a
  plaintext `last4` hint.

Domain tables (`household_members`, `vehicles`, `properties`, `appliances`, `pets`, `schools`,
`subscriptions`, `documents`, `valuables`, `memberships`, `estate_records`) hold what is genuinely
specific, plus `id`, `family_id`, `notes`, `last_verified_at`, `created_at`, `updated_at`.

Supporting tables: `families`, `family_members` (with roles: owner, adult, teen, viewer),
`record_keys` (wrapped CEKs), `attachments`, `reminders`, `shares`, `audit_log`, `subscriptions_billing`.

**RLS:** every table carries `family_id` and is gated by a `SECURITY DEFINER` helper
`is_family_member(family_id)` — a direct subquery against `family_members` inside the policy causes
infinite recursion. Write access additionally checks role. Zero tables are reachable without a
policy; verify with a test that enumerates `pg_tables` and asserts RLS is enabled on all of them.

---

## Part 3 — Interface

The design target is a 70-year-old grandparent on a phone, not a power user. Concretely:

**Reduce what must be filled in.** Every entity shows two to four core fields; everything else sits
behind "Add more details." Nothing is required except a name. A vehicle can be saved as just
"Mom's Honda" and enriched later — a form that demands a VIN before saving is a form that gets
abandoned.

**Never lose work.** Autosave per field with an unobtrusive "Saved" indicator. No Save buttons, no
modal that discards on accidental dismissal.

**Type as little as possible.** Vehicle make and model pickers, insurance carrier autocomplete,
state and country pickers, automatic phone formatting, date pickers that also accept typing, and a
"same as" control to copy an address or carrier from an existing record.

**Make secrets safe to use.** Tier 1 values render masked with tap-to-reveal and tap-to-copy, and
the clipboard auto-clears after 30 seconds. WiFi passwords get a QR code generator, as you planned.

**Onboard with a wizard, not an empty database.** Five questions — who's in the family, how many
cars, own or rent, any pets — generate a personalized checklist. A section completeness meter and
gentle "12 things left" nudges do the rest. Empty states show a filled-in example rather than a
blank form.

**Emergency mode.** A persistent, one-tap screen with allergies, blood types, medications, emergency
contacts, insurance cards, shutoff locations, and pet microchips — readable offline, printable to a
single page for the fridge and the glovebox.

**Renewals dashboard.** Everything expiring in the next 90 days, sorted by date, on the home screen.
This is the retention engine: it is the reason someone opens the app in a month when they have
nothing to add.

Visually: 16px+ base type, high contrast, generous spacing, one accent color, plain language
throughout ("Who's in your family" not "Manage household member entities"), and no dense tables on
mobile — cards showing the two or three facts you'd actually want at a glance.

---

## Part 4 — Tiers & Billing

| | **Free** | **Family** | **Legacy** |
|---|---|---|---|
| Users | 1 | Up to 6, each with their own login and role | Up to 6 |
| Categories | All | All | All |
| Records | Unlimited | Unlimited | Unlimited |
| Renewal reminders | In-app | In-app + email | + SMS |
| Attachments | ~50 MB | ~5 GB | ~5 GB |
| Encrypted offline backup / export | — | ✓ | ✓ |
| Cross-family sync (share with parents, adult kids) | — | ✓ | ✓ |
| Emergency access / dead-man's switch | — | — | ✓ |
| Audit log & version history | — | 90 days | Unlimited |

Give the free tier the whole schema, not a crippled subset — the conversion event is *inviting a
spouse*, which only happens after the vault is full. Bill annually through Stripe with a webhook
into Supabase; enforce entitlements server-side in RLS policies, never in the client.

---

## Part 5 — Build Order

Ten milestones. Each ends in something deployable and testable.

1. **Foundation** — Next.js + TypeScript + Tailwind scaffold, Supabase project, `families` /
   `family_members` / auth, RLS helper and policy template, Dockerfile, Easypanel deploy, CI.
2. **Crypto core** — `lib/crypto/` with Argon2id KDF, AES-GCM seal/open, DEK/CEK wrapping, recovery
   code generation, X25519 envelopes. Heavy unit tests. No UI yet.
3. **Vault shell** — ✅ *done.* Magic-link sign-in, family creation, the recovery-kit ceremony
   (print, download, checkbox, and a typed-back group), unlock, recovery, passphrase change, and
   auto-lock with cross-tab locking. Argon2id runs in a Web Worker, so raw key bytes and the
   passphrase never reach the main thread.

   Two changes from the original sketch. Passkey quick-unlock moved to Milestone 10, where the
   other device and member key work lives. And sign-in is magic-link only: an account password
   alongside a vault passphrase means two secrets, which users make identical, which quietly
   collapses the security model.
4. **Generic tables & UI kit** — ✅ *done.* `contacts`, `policies`, and `financial_accounts`, with
   the shared record list, detail form, autosave, and masked-secret components.

   It went further than "shared components": a record type is now a **declaration**, not a screen.
   A `RecordDefinition` names the table, marks which fields are secret, and labels each one; from
   that, the list, the form, the encryption, the database mapping, and the route all follow. All
   three categories share one pair of routes (`/[slug]` and `/[slug]/[id]`), so the remaining
   categories in Milestone 6 are definitions rather than screens.

   Marking a field `secret` is the only thing a definition has to get right, and it is the one
   thing a form cannot override — sealing happens in the repository, below every screen.

   `attachments` slipped to Milestone 6, where document upload belongs alongside the categories
   that need it.
5. **Core categories** — Household Members, House (with appliances and finishes), Vehicles (with
   service log). The three heaviest sections; they exercise the whole pattern.
6. **Remaining categories** — Health, Education, Communication, Pets, Subscriptions, Estate &
   Legal, Documents, Valuables, Memberships, Travel. Mostly definitions now, plus `attachments`
   and the child-record pattern (service logs, health facts) that the definition layer does not
   yet cover.
7. **Reminders & renewals** — `expires_on` indexing, dashboard, Supabase scheduled function, email
   via Resend, `last_verified_at` nudges.
8. **Emergency mode & print** — break-glass screen, offline cache, single-page printable sheet.
9. **Onboarding & polish** — setup wizard, completeness meters, empty states, PWA manifest and
   service worker, accessibility pass.
10. **Paid features** — Stripe billing, member invitations with DEK re-wrapping, encrypted export
    and offline backup, cross-family sharing with CEK re-wrapping, audit log, and passkey
    quick-unlock via the WebAuthn PRF extension.

Milestones 1–4 are the ones worth slowing down on. The encryption and RLS foundations are the parts
that are painful to change once real family data exists.

---

## Verification

- **Crypto** — Vitest suite: round-trip seal/open, wrong-passphrase rejection, recovery-code unlock,
  DEK re-wrapping for a new member, CEK re-wrapping for a share, envelope version compatibility.
- **RLS** — integration tests using two real Supabase users in different families, asserting that
  every table returns zero rows cross-family for select, insert, update, and delete. Plus a test
  that enumerates `pg_tables` and fails if any table has RLS disabled.
- **Server blindness** — a test that writes a record with known secret values, then queries the
  table with the service-role key and asserts the plaintext appears nowhere in the row. This is the
  test that proves the product's central claim.
- **E2E (Playwright)** — signup → recovery kit → add a household member with an SSN → lock → unlock
  → verify the value → add a vehicle → verify the renewal appears on the dashboard.
- **Offline** — load the app, go offline in devtools, confirm emergency mode and cached records
  still render.
- **Manual** — deploy to Easypanel, install the PWA on an actual phone, and time how long it takes
  to add a vehicle from a cold start. If it is over 30 seconds, the form is too long.
