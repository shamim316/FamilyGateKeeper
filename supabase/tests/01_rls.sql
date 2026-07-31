-- Row-level security tests.
--
-- Two real users in two different families, exercised through the same
-- `authenticated` role PostgREST uses. Every assertion is about the thing that
-- would end a product like this: one family seeing another family's records.
--
-- Run with: psql -v ON_ERROR_STOP=1 -f supabase/tests/01_rls.sql

\set ON_ERROR_STOP on
\set QUIET on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'dana@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'sam@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'nosy@example.com');

-- Deliberately no grants here. 0005_api_grants.sql is responsible for them, and
-- granting again would hide the case where that migration is wrong or missing —
-- which is exactly how this went unnoticed until a real project was connected.

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', user_id, true);
$$;

create or replace function pg_temp.check(label text, condition boolean)
returns void language plpgsql as $$
begin
  if condition then
    raise notice 'ok   %', label;
  else
    raise exception 'FAIL %', label;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dana creates a family
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

insert into public.families (id, name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Whitfield');

select pg_temp.check(
  'creating a family makes the creator its owner',
  (select role = 'owner' and status = 'active'
     from public.family_members
    where family_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '11111111-1111-1111-1111-111111111111'));

insert into public.household_members (id, family_id, wrapped_cek, display_name, ssn)
values (
  'dddddddd-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '{"v":1,"alg":"A256GCM","iv":"aaaa","ct":"bbbb"}'::app.sealed,
  'Dana Whitfield',
  '{"v":1,"alg":"A256GCM","iv":"cccc","ct":"dddd"}'::app.sealed
);

insert into public.vehicles (id, family_id, wrapped_cek, nickname, registration_expires_on)
values (
  'eeeeeeee-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '{"v":1,"alg":"A256GCM","iv":"aaaa","ct":"bbbb"}'::app.sealed,
  'Dana''s Accord',
  date '2026-11-01'
);

-- ---------------------------------------------------------------------------
-- Sam creates a separate family
-- ---------------------------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

insert into public.families (id, name)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'Okonkwo');

insert into public.household_members (id, family_id, wrapped_cek, display_name)
values (
  'dddddddd-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000002',
  '{"v":1,"alg":"A256GCM","iv":"aaaa","ct":"bbbb"}'::app.sealed,
  'Sam Okonkwo'
);

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

select pg_temp.check(
  'a family sees only its own household members',
  (select count(*) = 1 from public.household_members));

select pg_temp.check(
  'the other family''s member is invisible',
  (select count(*) = 0 from public.household_members
    where id = 'dddddddd-0000-0000-0000-000000000001'));

select pg_temp.check(
  'the other family''s vehicles are invisible',
  (select count(*) = 0 from public.vehicles));

select pg_temp.check(
  'the other family itself is invisible',
  (select count(*) = 1 from public.families));

-- Updates and deletes silently affect nothing rather than erroring, which is
-- what RLS does — so assert on the row count.
with attempted as (
  update public.household_members set display_name = 'Pwned'
   where id = 'dddddddd-0000-0000-0000-000000000001' returning 1
)
select pg_temp.check('cannot update another family''s record',
  (select count(*) = 0 from attempted));

with attempted as (
  delete from public.household_members
   where id = 'dddddddd-0000-0000-0000-000000000001' returning 1
)
select pg_temp.check('cannot delete another family''s record',
  (select count(*) = 0 from attempted));

do $$
begin
  insert into public.household_members (family_id, wrapped_cek, display_name)
  values (
    'aaaaaaaa-0000-0000-0000-000000000001',
    '{"v":1,"alg":"A256GCM","iv":"aaaa","ct":"bbbb"}'::app.sealed,
    'Injected'
  );
  raise exception 'FAIL inserting into another family should be blocked';
exception
  when insufficient_privilege then
    raise notice 'ok   cannot insert into another family';
end $$;

-- The bootstrap clause on family_members_insert exists so the claim trigger
-- works under FORCE. It must not double as a way to join a family that already
-- has members.
do $$
begin
  insert into public.family_members (family_id, user_id, role, status, display_name)
  values (
    'aaaaaaaa-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    'owner', 'active', 'Interloper'
  );
  raise exception 'FAIL must not be able to claim ownership of an existing family';
exception
  when insufficient_privilege then
    raise notice 'ok   cannot claim ownership of a family that already has members';
end $$;

-- ---------------------------------------------------------------------------
-- A signed-in stranger with no family sees nothing at all
-- ---------------------------------------------------------------------------

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select pg_temp.check('a stranger sees no families', (select count(*) = 0 from public.families));
select pg_temp.check('a stranger sees no members', (select count(*) = 0 from public.household_members));
select pg_temp.check('a stranger sees no vehicles', (select count(*) = 0 from public.vehicles));
select pg_temp.check('a stranger sees no contacts', (select count(*) = 0 from public.contacts));
select pg_temp.check('a stranger sees no renewals', (select count(*) = 0 from public.upcoming_renewals));

-- ---------------------------------------------------------------------------
-- Wrapped keys are per-user, not per-family
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

insert into public.member_key_wrappings (family_id, user_id, via, wrapped_dek, kdf_params, salt)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'passphrase',
  '{"v":1,"alg":"A256GCM","iv":"aaaa","ct":"bbbb"}'::app.sealed,
  '{"alg":"argon2id","m":32768,"t":2,"p":1}'::jsonb,
  'c2FsdA'
);

select pg_temp.check('a member sees their own wrapped key',
  (select count(*) = 1 from public.member_key_wrappings));

-- Invite Sam into Dana's family, then confirm Sam still cannot read Dana's key.
insert into public.family_members (family_id, user_id, role, status, display_name, joined_at)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222',
  'adult', 'active', 'Sam', now()
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select pg_temp.check(
  'an invited member can now read the family''s records',
  (select count(*) = 1 from public.household_members
    where family_id = 'aaaaaaaa-0000-0000-0000-000000000001'));

select pg_temp.check(
  'but still cannot read another member''s wrapped key',
  (select count(*) = 0 from public.member_key_wrappings
    where user_id = '11111111-1111-1111-1111-111111111111'));

-- ---------------------------------------------------------------------------
-- Read-only members
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
update public.family_members set role = 'viewer'
 where family_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   and user_id = '22222222-2222-2222-2222-222222222222';

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select pg_temp.check('a viewer can still read',
  (select count(*) = 1 from public.household_members
    where family_id = 'aaaaaaaa-0000-0000-0000-000000000001'));

do $$
begin
  insert into public.contacts (family_id, wrapped_cek, name)
  values (
    'aaaaaaaa-0000-0000-0000-000000000001',
    '{"v":1,"alg":"A256GCM","iv":"aaaa","ct":"bbbb"}'::app.sealed,
    'Should not exist'
  );
  raise exception 'FAIL a viewer must not be able to write';
exception
  when insufficient_privilege then
    raise notice 'ok   a viewer cannot write';
end $$;

-- ---------------------------------------------------------------------------
-- The sealed domain refuses plaintext
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

do $$
begin
  insert into public.household_members (family_id, wrapped_cek, display_name, ssn)
  values (
    'aaaaaaaa-0000-0000-0000-000000000001',
    '{"v":1,"alg":"A256GCM","iv":"aaaa","ct":"bbbb"}'::app.sealed,
    'Careless',
    '"123-45-6789"'::jsonb::app.sealed
  );
  raise exception 'FAIL a bare string must not be storable in a secret column';
exception
  when check_violation then
    raise notice 'ok   a secret column rejects plaintext';
end $$;

do $$
begin
  perform '{"iv":"aaaa","ct":"bbbb"}'::jsonb::app.sealed;
  raise exception 'FAIL an envelope missing its version must be rejected';
exception
  when check_violation then
    raise notice 'ok   a malformed envelope is rejected';
end $$;

-- ---------------------------------------------------------------------------
-- Renewals respect the same boundary
-- ---------------------------------------------------------------------------

select pg_temp.check(
  'the renewals view shows this family''s registration',
  (select count(*) = 1 from public.upcoming_renewals
    where kind = 'vehicle_registration' and due_on = date '2026-11-01'));

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.check(
  'the renewals view leaks nothing to a stranger',
  (select count(*) = 0 from public.upcoming_renewals));

-- ---------------------------------------------------------------------------
-- Every table in public has row-level security
-- ---------------------------------------------------------------------------

reset role;

select pg_temp.check(
  'every table in public enforces row-level security',
  (select count(*) = 0 from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity));

-- Without FORCE, the owning role sidesteps every policy above — including any
-- SECURITY DEFINER function, which is how a helper quietly becomes a hole.
-- family_members is the one documented exception; see 0001.
select pg_temp.check(
  'every table but family_members forces row-level security on its owner too',
  (select count(*) = 0 from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relforcerowsecurity
      and c.relname <> 'family_members'));

-- And the exception itself is deliberate, not drift: forcing it would make
-- every query in the app recurse until the stack runs out.
select pg_temp.check(
  'family_members still has row-level security enabled',
  (select relrowsecurity and not relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'family_members'));

-- Policies are moot if the role cannot address the table in the first place.
select pg_temp.check(
  'the application role can reach every table',
  (select count(*) = 0 from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v')
      and not has_table_privilege('authenticated', c.oid, 'SELECT')));

select pg_temp.check(
  'no table is reachable without signing in',
  (select count(*) = 0 from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v')
      and has_table_privilege('anon', c.oid, 'SELECT')));

select pg_temp.check(
  'every table in public has at least one policy',
  (select count(*) = 0
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)));

rollback;
