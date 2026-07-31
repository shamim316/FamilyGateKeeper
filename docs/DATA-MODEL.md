# Data model

How the field list in [`PLAN.md`](PLAN.md) maps onto actual tables. The migrations live in
`supabase/migrations/`; this is the map, not the territory.

## The shape every record shares

| Column | Why |
|---|---|
| `id`, `family_id` | Ownership, and the anchor for every row-level security policy |
| `wrapped_cek` | This record's content key, sealed under the family key |
| `notes` | An escape hatch, so a missing field never blocks someone from recording what they know |
| `last_verified_at` | Vault data rots silently; "verified 14 months ago" is what keeps it honest |
| `created_at`, `updated_at` | Maintained by a trigger |

Secret columns use the `app.sealed` domain, which rejects anything that is not an AES-GCM envelope.
A bug that tries to write a bare SSN fails at the database rather than storing it readable.

Where a secret needs to be recognisable before unlock, a plaintext `*_hint` column sits beside it
holding a masked form (`••••4821`).

## Three tables doing most of the work

Rather than repeating "vendor name, phone, account number" across forty columns:

**`contacts`** — every vendor, provider, agent, contractor, doctor, school, bank, and vet. The
plumber who also fixed the water heater is one row, not two, and the family gets a searchable
directory as a side effect. `category` is free text on purpose: needing "chimney sweep" should not
require a migration.

**`policies`** — every insurance policy of any kind, discriminated by `policy_type`. Health, dental,
vision, life, disability, long-term care, auto, home, flood, umbrella, warranty, pet, travel. They
all have a carrier, a policy number, a claims phone, and a renewal date. Per-type extras (RxBIN for
health, face amount for life) live in a `details` JSONB column. `policy_coverage` links a policy to
the people, vehicles, properties, or pets it covers, because a family auto policy covers three cars
and two drivers.

**`financial_accounts`** — checking through crypto through loans, discriminated by `account_type`,
with `autopay_from_account_id` pointing one account at another.

## Category map

| Category | Tables |
|---|---|
| Household | `household_members`, `member_identifications` |
| Health | `health_providers`, `health_facts`, `policies` |
| Vehicles | `vehicles`, `vehicle_service_records` |
| House | `properties`, `property_utilities`, `appliances`, `property_finishes`, `property_projects` |
| Communication | `communication_services`, `phone_lines`, `wifi_networks` |
| Education | `education_records`, `activities` |
| Finances | `financial_accounts` |
| Subscriptions | `subscriptions` |
| Pets | `pets` |
| Estate | `estate_records` |
| Valuables | `valuables` |
| Memberships & travel | `memberships`, `loyalty_programs` |
| Documents | `attachments` |

## Decisions worth knowing about

**Government IDs share one table.** A driver's license, a passport, a birth certificate, and a Global
Entry card all reduce to a number, an issuer, an expiry, and where the paper original is.
`member_identifications` holds all of them, which means one expiration-reminder path instead of six,
and adding a document type is an enum value rather than a migration.

**Vehicle maintenance is a log.** "Date and vendor of last maintenance" overwrites exactly the
history that matters when selling the car or arguing about a warranty, so
`vehicle_service_records` is a child table.

**Contractors are not fixed slots.** "Plumber, electrician, landscaper" as columns on `properties`
breaks the moment a family has two plumbers. They are `contacts` rows.

**Appliances and finishes earn their own tables.** Filter sizes, warranty dates, and the paint colour
in the back bedroom are individually trivial and collectively the reason someone opens the app.

**Health facts are one table.** Allergies, medications, conditions, immunizations, and surgeries
share a shape and a purpose: a thing about this person's health that someone needs in ten seconds.
`show_in_emergency` promotes a row onto the break-glass screen.

**Expiration dates are collected by a view.** `upcoming_renewals` unions every date in the schema
that can lapse. It is declared `security_invoker`, so the caller's own policies apply and the view
cannot become a way around them.

## Security

Every table in `public` has row-level security enabled, forced, and carrying policies; the last
migration fails if any of those three is missing. Policies are generated in a loop so all 28
family-scoped tables enforce identical rules.

Access is decided by three `SECURITY DEFINER` predicates in the `app` schema —
`is_family_member`, `can_write_family`, `is_family_owner` — which live outside `public` so
PostgREST does not expose them as callable endpoints.

`family_members` is the one table with RLS enabled but not forced, and it has to stay that way: the
predicates above must read it from inside its own policies, and forcing it makes
`is_family_member` re-enter `family_members_select` until the stack runs out. The comment in
`0001_foundation.sql` explains it, and the test suite asserts the exception is deliberate rather
than drift.

## Verifying

```bash
npm run test:db
```

This applies the migrations to a throwaway database owned by a role that is neither superuser nor
`BYPASSRLS`, then runs 27 checks. The role matters: a superuser owner is exempt from forced RLS, so
running as `postgres` would pass even with recursive or wide-open policies.
