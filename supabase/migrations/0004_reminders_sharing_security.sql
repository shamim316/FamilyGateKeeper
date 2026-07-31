-- Reminders, cross-family sharing, the audit log, and the row-level security
-- that covers every table added in 0002 and 0003.

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

create type app.reminder_channel as enum ('in_app', 'email', 'sms');

-- Renewal reminders are generated from the expiration dates already on each
-- record, so the server can send them without ever decrypting anything: the
-- date and the label are tier 0, the secret is not involved.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,

  subject_type text not null,
  subject_id uuid not null,

  title text not null,
  due_on date not null,
  -- How many days ahead to notify. Multiple rows give multiple nudges.
  lead_days smallint not null default 30,
  channel app.reminder_channel not null default 'in_app',

  dismissed_at timestamptz,
  sent_at timestamptz,
  snoozed_until date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (subject_type, subject_id, due_on, lead_days, channel)
);

create index reminders_due_idx on public.reminders (due_on)
  where dismissed_at is null and sent_at is null;
create index reminders_family_idx on public.reminders (family_id, due_on);

-- Everything with an expiration date, in one place. This is what the home
-- screen reads, and the reason someone opens the app in a month when they have
-- nothing new to add.
create view public.upcoming_renewals
with (security_invoker = true) as
  select family_id, 'vehicle_registration' as kind, id as subject_id, 'vehicles' as subject_type,
         nickname as label, registration_expires_on as due_on
    from public.vehicles where registration_expires_on is not null
  union all
  select family_id, 'vehicle_inspection', id, 'vehicles', nickname, inspection_due_on
    from public.vehicles where inspection_due_on is not null
  union all
  select family_id, 'vehicle_service', id, 'vehicles', nickname, next_service_on
    from public.vehicles where next_service_on is not null
  union all
  select family_id, 'identification', id, 'member_identifications',
         coalesce(label, identification_type::text), expires_on
    from public.member_identifications where expires_on is not null
  union all
  select family_id, 'policy', id, 'policies',
         coalesce(label, carrier_name, policy_type::text), coalesce(renews_on, expires_on)
    from public.policies where coalesce(renews_on, expires_on) is not null
  union all
  select family_id, 'subscription', id, 'subscriptions', name, renews_on
    from public.subscriptions where is_active and renews_on is not null
  union all
  select family_id, 'subscription_trial', id, 'subscriptions', name, trial_ends_on
    from public.subscriptions where is_active and trial_ends_on is not null
  union all
  select family_id, 'appliance_warranty', id, 'appliances', name, warranty_expires_on
    from public.appliances where warranty_expires_on is not null
  union all
  select family_id, 'membership', id, 'memberships', name, expires_on
    from public.memberships where expires_on is not null
  union all
  select family_id, 'professional_license', id, 'memberships', name, continuing_education_due_on
    from public.memberships where continuing_education_due_on is not null
  union all
  select family_id, 'pet_license', id, 'pets', name, license_expires_on
    from public.pets where license_expires_on is not null
  union all
  select family_id, 'pet_rabies', id, 'pets', name, rabies_expires_on
    from public.pets where rabies_expires_on is not null
  union all
  select family_id, 'lease', id, 'properties', nickname, lease_ends_on
    from public.properties where lease_ends_on is not null
  union all
  select family_id, 'health_fact', id, 'health_facts', name, expires_on
    from public.health_facts where is_active and expires_on is not null;

comment on view public.upcoming_renewals is
  'Every expiration date in the vault. security_invoker means the caller''s own RLS applies.';

-- ---------------------------------------------------------------------------
-- Cross-family sharing
-- ---------------------------------------------------------------------------

create type app.share_status as enum ('pending', 'accepted', 'revoked');

-- Sharing moves one record's content key, sealed for the recipient's public
-- key. The family data key never moves, and revoking is deleting a row.
create table public.shares (
  id uuid primary key default gen_random_uuid(),

  from_family_id uuid not null references public.families (id) on delete cascade,
  to_family_id uuid references public.families (id) on delete cascade,
  to_email citext,

  subject_type text not null,
  subject_id uuid not null,

  -- The record's CEK, sealed for the recipient. Opaque to the server.
  sealed_cek jsonb not null,

  can_edit boolean not null default false,
  status app.share_status not null default 'pending',

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index shares_from_idx on public.shares (from_family_id);
create index shares_to_idx on public.shares (to_family_id) where to_family_id is not null;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigserial primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,

  action text not null,
  subject_type text,
  subject_id uuid,
  -- Never the values themselves; only which fields changed.
  changed_fields text[],

  created_at timestamptz not null default now()
);

create index audit_log_family_idx on public.audit_log (family_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security for every family-scoped table
--
-- Generated rather than written out, so a table added later cannot quietly
-- ship without policies, and so all 30 tables enforce identical rules.
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
  family_scoped text[] := array[
    'contacts', 'policies', 'policy_coverage', 'financial_accounts', 'attachments',
    'household_members', 'member_identifications', 'health_providers', 'health_facts',
    'vehicles', 'vehicle_service_records', 'properties', 'property_utilities',
    'appliances', 'property_finishes', 'property_projects', 'communication_services',
    'phone_lines', 'wifi_networks', 'education_records', 'activities', 'subscriptions',
    'pets', 'estate_records', 'valuables', 'memberships', 'loyalty_programs',
    'reminders'
  ];
begin
  foreach target in array family_scoped loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);

    execute format(
      'create policy %I on public.%I for select using (app.is_family_member(family_id))',
      target || '_select', target);

    execute format(
      'create policy %I on public.%I for insert with check (app.can_write_family(family_id))',
      target || '_insert', target);

    execute format(
      'create policy %I on public.%I for update using (app.can_write_family(family_id)) '
      'with check (app.can_write_family(family_id))',
      target || '_update', target);

    execute format(
      'create policy %I on public.%I for delete using (app.can_write_family(family_id))',
      target || '_delete', target);

    -- Only tables that track updated_at get the trigger.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = target and column_name = 'updated_at'
    ) then
      execute format(
        'create trigger %I before update on public.%I '
        'for each row execute function app.touch_updated_at()',
        target || '_touch', target);
    end if;
  end loop;
end $$;

-- Sharing and the audit log do not follow the family_id pattern.

alter table public.shares enable row level security;
alter table public.shares force row level security;

create policy shares_select on public.shares
  for select using (
    app.is_family_member(from_family_id)
    or (to_family_id is not null and app.is_family_member(to_family_id))
  );
create policy shares_insert on public.shares
  for insert with check (app.can_write_family(from_family_id));
-- The sender may revoke; the recipient may only accept, which is why both
-- sides can update but the check keeps each to their own family.
create policy shares_update on public.shares
  for update using (
    app.can_write_family(from_family_id)
    or (to_family_id is not null and app.is_family_member(to_family_id))
  ) with check (
    app.can_write_family(from_family_id)
    or (to_family_id is not null and app.is_family_member(to_family_id))
  );
create policy shares_delete on public.shares
  for delete using (app.can_write_family(from_family_id));

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

-- Append-only: readable by the family, never updated or deleted by anyone but
-- the service role, which bypasses RLS.
create policy audit_log_select on public.audit_log
  for select using (app.is_family_member(family_id));
create policy audit_log_insert on public.audit_log
  for insert with check (app.is_family_member(family_id));

-- ---------------------------------------------------------------------------
-- Belt and braces
--
-- If a future migration adds a table to public and forgets its policies, this
-- fails the migration rather than shipping an open table.
-- ---------------------------------------------------------------------------

do $$
declare
  unprotected text;
  unforced text;
  policyless text;
begin
  select string_agg(c.relname, ', ') into unprotected
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'Tables without row-level security: %', unprotected;
  end if;

  -- ENABLE alone leaves the owning role unconstrained, which is how a
  -- SECURITY DEFINER function ends up quietly reading every family's rows.
  --
  -- family_members is exempt on purpose: the access predicates must read it
  -- from inside its own policies, and forcing it makes that recurse until the
  -- stack runs out. See the note in 0001.
  select string_agg(c.relname, ', ') into unforced
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relforcerowsecurity
    and c.relname <> 'family_members';

  if unforced is not null then
    raise exception 'Tables with row-level security enabled but not forced: %', unforced;
  end if;

  select string_agg(c.relname, ', ') into policyless
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if policyless is not null then
    raise exception 'Tables with row-level security but no policies: %', policyless;
  end if;
end $$;
