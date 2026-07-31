-- Table privileges for the API roles.
--
-- Row-level security decides which rows a request may see. It does nothing
-- about whether the role may touch the table at all — that is a GRANT, and
-- without one PostgREST answers "permission denied for table" no matter how
-- correct the policies are.
--
-- Supabase's project bootstrap sets default privileges that would grant most of
-- this automatically. Depending on that would make the schema non-portable —
-- the plan keeps self-hosting a live option — and would leave the app's
-- security posture implicit in the host's configuration rather than written
-- down here. It also grants `anon`, which this app never wants.

-- ---------------------------------------------------------------------------
-- anon: nothing at all
--
-- Every table in this app requires a signed-in user. Row-level security would
-- return no rows to an anonymous caller anyway, but a table an unauthenticated
-- request cannot even address is a shorter path to the same answer.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- authenticated: ordinary access, gated by the policies
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- The service role bypasses RLS and is used only by the reminder job and the
-- billing webhook, never by anything the browser can reach.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- The same rules for anything added later
--
-- Without these, a table created by a future migration would be unreachable
-- until someone remembered to grant it by hand.
-- ---------------------------------------------------------------------------

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on sequences to service_role;

-- ---------------------------------------------------------------------------
-- Belt and braces
--
-- Fails the migration if any table in public is unreachable by the role the
-- application actually connects as, or reachable by the one it never should.
-- ---------------------------------------------------------------------------

do $$
declare
  ungranted text;
  exposed text;
begin
  select string_agg(c.relname, ', ') into ungranted
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'v')
    and not has_table_privilege('authenticated', c.oid, 'SELECT');

  if ungranted is not null then
    raise exception 'Tables the application cannot read: %', ungranted;
  end if;

  select string_agg(c.relname, ', ') into exposed
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'v')
    and has_table_privilege('anon', c.oid, 'SELECT');

  if exposed is not null then
    raise exception 'Tables reachable without signing in: %', exposed;
  end if;
end $$;
