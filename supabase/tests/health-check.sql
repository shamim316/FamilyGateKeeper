-- Health check for a live project, with nothing installed.
--
-- Paste the whole file into the Supabase SQL editor and run it. Every row comes
-- back either `ok` or `FAIL`, with what to do about it.
--
-- This covers the half of `npm run preflight` that matters most — the schema,
-- the row-level security, and the grants — and needs no Node, no clone, and no
-- environment file. It is read-only.

with expected_tables(name) as (
  values
    ('families'), ('family_members'), ('user_identities'), ('member_key_wrappings'),
    ('contacts'), ('policies'), ('policy_coverage'), ('financial_accounts'), ('attachments'),
    ('household_members'), ('member_identifications'), ('health_providers'), ('health_facts'),
    ('vehicles'), ('vehicle_service_records'), ('properties'), ('property_utilities'),
    ('appliances'), ('property_finishes'), ('property_projects'), ('communication_services'),
    ('phone_lines'), ('wifi_networks'), ('education_records'), ('activities'),
    ('subscriptions'), ('pets'), ('estate_records'), ('valuables'), ('memberships'),
    ('loyalty_programs'), ('reminders'), ('shares'), ('audit_log')
),

present as (
  select c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.oid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v')
),

results(sort_order, check_name, status, detail) as (

  -- 0001 — the foundation objects everything else depends on
  select 1, 'app schema exists',
    case when exists (select 1 from pg_namespace where nspname = 'app')
      then 'ok' else 'FAIL' end,
    'Migration 0001_foundation.sql'

  union all
  select 2, 'sealed-envelope domain exists',
    case when exists (
      select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'app' and t.typname = 'sealed'
    ) then 'ok' else 'FAIL' end,
    'Stops a bug writing a readable SSN into a secret column'

  union all
  select 3, 'access predicates exist',
    case when (
      select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app'
        and p.proname in ('is_family_member', 'can_write_family', 'is_family_owner',
                          'family_has_no_members')
    ) = 4 then 'ok' else 'FAIL' end,
    'Every row-level security policy calls these'

  union all
  select 4, 'creating a family claims ownership',
    case when exists (
      select 1 from pg_trigger where tgname = 'families_claim_owner' and not tgisinternal
    ) then 'ok' else 'FAIL' end,
    'Without it, a new family has no owner and is unusable'

  -- Tables
  union all
  select 5, 'all ' || (select count(*) from expected_tables) || ' tables exist',
    case when not exists (
      select 1 from expected_tables e
      where not exists (select 1 from present p where p.relname = e.name)
    ) then 'ok' else 'FAIL' end,
    coalesce(
      'missing: ' || (
        select string_agg(e.name, ', ' order by e.name) from expected_tables e
        where not exists (select 1 from present p where p.relname = e.name)
      ),
      'Migrations 0001 through 0004'
    )

  union all
  select 6, 'renewals view exists',
    case when exists (select 1 from present where relname = 'upcoming_renewals' and relkind = 'v')
      then 'ok' else 'FAIL' end,
    'Drives the reminders dashboard'

  union all
  select 7, 'renewals view runs as the caller',
    -- Postgres keeps reloptions as the literal text given, so this is
    -- `security_invoker=true` here and could be `=on` or `=1` elsewhere.
    -- Matching one spelling is how this check first reported a false failure.
    case when exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral unnest(coalesce(c.reloptions, '{}')) as option
      where n.nspname = 'public' and c.relname = 'upcoming_renewals'
        and lower(split_part(option, '=', 1)) = 'security_invoker'
        and lower(split_part(option, '=', 2)) in ('true', 'on', '1', 'yes')
    ) then 'ok' else 'FAIL' end,
    'Without this the view is a way around row-level security'

  -- Row-level security
  union all
  select 8, 'row-level security enabled everywhere',
    case when not exists (select 1 from present where relkind = 'r' and not relrowsecurity)
      then 'ok' else 'FAIL' end,
    coalesce('unprotected: ' || (
      select string_agg(relname, ', ' order by relname) from present
      where relkind = 'r' and not relrowsecurity
    ), 'All tables')

  union all
  select 9, 'row-level security forced on the owner too',
    case when not exists (
      select 1 from present
      where relkind = 'r' and not relforcerowsecurity and relname <> 'family_members'
    ) then 'ok' else 'FAIL' end,
    coalesce('not forced: ' || (
      select string_agg(relname, ', ' order by relname) from present
      where relkind = 'r' and not relforcerowsecurity and relname <> 'family_members'
    ), 'family_members is exempt on purpose — forcing it makes the predicates recurse')

  union all
  select 10, 'every table has policies',
    case when not exists (
      select 1 from present p where p.relkind = 'r'
        and not exists (select 1 from pg_policy where polrelid = p.oid)
    ) then 'ok' else 'FAIL' end,
    coalesce('no policies: ' || (
      select string_agg(p.relname, ', ' order by p.relname) from present p
      where p.relkind = 'r' and not exists (select 1 from pg_policy where polrelid = p.oid)
    ), 'All tables')

  -- Grants. Policies decide which rows; a grant decides whether the role may
  -- address the table at all.
  union all
  select 11, 'the app can reach every table',
    case when not exists (
      select 1 from present where not has_table_privilege('authenticated', oid, 'SELECT')
    ) then 'ok' else 'FAIL' end,
    coalesce('cannot read: ' || (
      select string_agg(relname, ', ' order by relname) from present
      where not has_table_privilege('authenticated', oid, 'SELECT')
    ), 'Migration 0005_api_grants.sql')

  union all
  select 12, 'nothing is readable without signing in',
    case when not exists (
      select 1 from present where has_table_privilege('anon', oid, 'SELECT')
    ) then 'ok' else 'FAIL' end,
    coalesce('exposed to anon: ' || (
      select string_agg(relname, ', ' order by relname) from present
      where has_table_privilege('anon', oid, 'SELECT')
    ), 'anon has no access to anything, which is correct')

  union all
  select 13, 'the app can write',
    case when not exists (
      select 1 from present where relkind = 'r'
        and not has_table_privilege('authenticated', oid, 'INSERT')
    ) then 'ok' else 'FAIL' end,
    coalesce('cannot insert: ' || (
      select string_agg(relname, ', ' order by relname) from present
      where relkind = 'r' and not has_table_privilege('authenticated', oid, 'INSERT')
    ), 'Migration 0005_api_grants.sql')
)

select
  case when status = 'ok' then '✓' else '✗' end as " ",
  check_name as "check",
  status,
  detail
from results
order by sort_order;
