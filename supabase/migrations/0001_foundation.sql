-- Foundation: families, membership, key storage, and the primitives every
-- other migration builds on.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- Helper functions live outside `public` so PostgREST does not expose them as
-- callable RPC endpoints.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The sealed-envelope domain
-- ---------------------------------------------------------------------------

-- Secret columns hold a client-produced envelope, never a bare value. The check
-- means a bug that tries to write plaintext into a secret column fails loudly
-- at the database rather than silently storing a readable SSN.
create domain app.sealed as jsonb
  check (
    value is null
    or (
      value ? 'v'
      and value ? 'alg'
      and value ? 'iv'
      and value ? 'ct'
      and value ->> 'alg' = 'A256GCM'
      and jsonb_typeof(value -> 'v') = 'number'
    )
  );

comment on domain app.sealed is
  'AES-256-GCM envelope produced in the browser. The server cannot read it.';

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type app.member_role as enum ('owner', 'adult', 'teen', 'viewer');
create type app.member_status as enum ('invited', 'active', 'suspended');
create type app.plan_tier as enum ('free', 'family', 'legacy');
create type app.key_wrapping as enum ('passphrase', 'recovery-code', 'device', 'member-public-key');

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Families and membership
-- ---------------------------------------------------------------------------

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan app.plan_tier not null default 'free',

  -- Billing. Written only by the Stripe webhook via the service role.
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,

  role app.member_role not null default 'adult',
  status app.member_status not null default 'invited',

  -- Shown in the UI before the invitee has accepted and created an account.
  display_name text not null,
  invite_email citext,

  invited_at timestamptz not null default now(),
  joined_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (family_id, user_id)
);

create index family_members_user_idx on public.family_members (user_id) where user_id is not null;
create index family_members_family_idx on public.family_members (family_id);

-- ---------------------------------------------------------------------------
-- Access predicates
--
-- These are SECURITY DEFINER because a policy on family_members that queries
-- family_members recurses infinitely. Defining them here breaks the cycle.
-- ---------------------------------------------------------------------------

create or replace function app.is_family_member(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function app.can_write_family(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family
      and fm.user_id = auth.uid()
      and fm.status = 'active'
      and fm.role in ('owner', 'adult', 'teen')
  );
$$;

create or replace function app.is_family_owner(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family
      and fm.user_id = auth.uid()
      and fm.status = 'active'
      and fm.role = 'owner'
  );
$$;

-- Used only by the bootstrap clause of family_members_insert below. A family
-- has no members for exactly the instant between its INSERT and the trigger
-- that claims it.
create or replace function app.family_has_no_members(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.family_members fm where fm.family_id = target_family
  );
$$;

grant execute on function app.is_family_member(uuid) to authenticated;
grant execute on function app.can_write_family(uuid) to authenticated;
grant execute on function app.is_family_owner(uuid) to authenticated;
grant execute on function app.family_has_no_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Key storage
--
-- All of this is ciphertext or public material. Storing it server-side is what
-- lets a family sign in on a new phone; none of it is useful without the
-- passphrase or recovery code that unwraps it.
-- ---------------------------------------------------------------------------

-- The X25519 keypair that lets someone receive an invite or a shared record
-- while offline.
--
-- The private half is sealed under the family data key, not under the user's
-- passphrase. Sealing it under the passphrase would orphan it the moment
-- someone recovers with their code and chooses a new one.
create table public.user_identities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  public_key text not null,
  wrapped_private_key app.sealed not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per credential that can unwrap a family's data key. A family
-- normally has at least two per member: their passphrase and their printed
-- recovery code, plus one per trusted device.
create table public.member_key_wrappings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  via app.key_wrapping not null,
  wrapped_dek app.sealed not null,

  -- Argon2id parameters and salt for the passphrase path; null for the others,
  -- which derive from high-entropy material and need no memory-hard KDF.
  kdf_params jsonb,
  salt text,

  -- "Dana's iPhone", shown in the security settings list.
  label text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,

  constraint passphrase_needs_kdf_params
    check (via <> 'passphrase' or (kdf_params is not null and salt is not null))
);

create index member_key_wrappings_lookup_idx
  on public.member_key_wrappings (user_id, family_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

-- FORCE as well as ENABLE, so policies apply even to the role that owns the
-- tables. Without it, anything connecting as the owner — including a SECURITY
-- DEFINER function written later — silently sidesteps every rule below.
alter table public.families enable row level security;
alter table public.families force row level security;
alter table public.user_identities enable row level security;
alter table public.user_identities force row level security;
alter table public.member_key_wrappings enable row level security;
alter table public.member_key_wrappings force row level security;

-- family_members is the deliberate exception, and must stay that way.
--
-- The access predicates above are SECURITY DEFINER precisely so they can read
-- this table without re-entering its own policies. FORCE removes the owner's
-- exemption, so the definer function becomes subject to the policy that calls
-- it: is_family_member -> family_members_select -> is_family_member, until the
-- stack runs out. Forcing it fails every query in the app, not just an edge
-- case, so if a future migration adds FORCE here the RLS suite will catch it.
--
-- Nothing is lost by the exception: application traffic arrives as
-- `authenticated`, never as the owner, so ENABLE alone governs every real
-- request.
alter table public.family_members enable row level security;

create policy families_select on public.families
  for select using (app.is_family_member(id));
create policy families_update on public.families
  for update using (app.is_family_owner(id)) with check (app.is_family_owner(id));
-- Anyone signed in may create a family; the trigger below makes them its owner.
create policy families_insert on public.families
  for insert with check (auth.uid() is not null);
create policy families_delete on public.families
  for delete using (app.is_family_owner(id));

create policy family_members_select on public.family_members
  for select using (app.is_family_member(family_id) or user_id = auth.uid());
-- Two ways a membership row is created: an existing owner invites someone, or
-- the creator of a brand-new family claims it. The second clause is what the
-- claim trigger relies on. It cannot be used to seize an existing family,
-- because a family stops having zero members the moment it is created.
create policy family_members_insert on public.family_members
  for insert with check (
    app.is_family_owner(family_id)
    or (
      user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
      and app.family_has_no_members(family_id)
    )
  );
create policy family_members_update on public.family_members
  for update using (app.is_family_owner(family_id) or user_id = auth.uid())
  with check (app.is_family_owner(family_id) or user_id = auth.uid());
create policy family_members_delete on public.family_members
  for delete using (app.is_family_owner(family_id));

-- Public keys are readable by anyone signed in: inviting someone requires
-- fetching their public key, and a public key is not a secret.
create policy user_identities_select on public.user_identities
  for select using (auth.uid() is not null);
create policy user_identities_write on public.user_identities
  for insert with check (user_id = auth.uid());
create policy user_identities_update on public.user_identities
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A wrapped key is only ever fetched by the person who can unwrap it.
create policy member_key_wrappings_select on public.member_key_wrappings
  for select using (user_id = auth.uid());
create policy member_key_wrappings_insert on public.member_key_wrappings
  for insert with check (
    user_id = auth.uid()
    -- An inviter seals the DEK for a new member's public key on their behalf.
    or (via = 'member-public-key' and app.is_family_owner(family_id))
  );
create policy member_key_wrappings_update on public.member_key_wrappings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy member_key_wrappings_delete on public.member_key_wrappings
  for delete using (user_id = auth.uid() or app.is_family_owner(family_id));

-- ---------------------------------------------------------------------------
-- Creating a family makes the creator its owner
-- ---------------------------------------------------------------------------

create or replace function app.claim_new_family()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.family_members (family_id, user_id, role, status, display_name, joined_at)
  values (
    new.id,
    auth.uid(),
    'owner',
    'active',
    coalesce(
      (select raw_user_meta_data ->> 'full_name' from auth.users where id = auth.uid()),
      'Owner'
    ),
    now()
  );
  return new;
end;
$$;

create trigger families_claim_owner
  after insert on public.families
  for each row execute function app.claim_new_family();

create trigger families_touch before update on public.families
  for each row execute function app.touch_updated_at();
create trigger family_members_touch before update on public.family_members
  for each row execute function app.touch_updated_at();
create trigger user_identities_touch before update on public.user_identities
  for each row execute function app.touch_updated_at();
create trigger member_key_wrappings_touch before update on public.member_key_wrappings
  for each row execute function app.touch_updated_at();
