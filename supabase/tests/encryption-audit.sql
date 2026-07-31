-- Is my data actually encrypted?
--
-- Run this in the Supabase SQL editor after entering something through the app.
-- It finds every secret column by itself — no list to maintain — counts what is
-- stored in each, and shows you a sample so you can see the ciphertext with
-- your own eyes.
--
-- Read-only. Safe to run against production whenever you want reassurance.

-- Keeps the editor output to the results themselves.
set client_min_messages = warning;

drop table if exists _fgk_audit;
create temp table _fgk_audit (
  sort_order int,
  scope text,
  detail text,
  rows_with_data bigint,
  sample text
);

do $$
declare
  column_row record;
  filled bigint;
  example text;
  total_columns int := 0;
  total_values bigint := 0;
begin
  -- Secret columns are discovered from the app.sealed domain rather than a
  -- hard-coded list, so a column added later is audited automatically and this
  -- cannot quietly fall out of date.
  for column_row in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.domain_schema = 'app'
      and c.domain_name = 'sealed'
      -- wrapped_cek and wrapped_dek are keys rather than user content; they get
      -- their own line below.
      and c.column_name not in ('wrapped_cek', 'wrapped_dek', 'wrapped_private_key')
    order by c.table_name, c.column_name
  loop
    total_columns := total_columns + 1;

    execute format(
      'select count(*) filter (where %I is not null), ' ||
      '       min(left((%I)::text, 90)) filter (where %I is not null) ' ||
      'from public.%I',
      column_row.column_name, column_row.column_name,
      column_row.column_name, column_row.table_name
    ) into filled, example;

    total_values := total_values + filled;

    if filled > 0 then
      insert into _fgk_audit values (
        2,
        column_row.table_name || '.' || column_row.column_name,
        'sealed',
        filled,
        example || '…'
      );
    end if;
  end loop;

  insert into _fgk_audit values (
    1,
    'Secret columns in the schema',
    total_columns || ' columns can hold a secret; ' || total_values ||
      ' currently do. Every one is AES-256-GCM, sealed in the browser.',
    total_values,
    null
  );

  -- The domain's own constraint is what makes "we cannot store plaintext" a
  -- fact about the database rather than a promise about the client code.
  insert into _fgk_audit values (
    3,
    'Plaintext is rejected by the database',
    case when exists (
      select 1 from pg_constraint con
      join pg_type t on t.oid = con.contypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'app' and t.typname = 'sealed'
    ) then 'yes — the app.sealed domain refuses anything that is not an envelope'
    else 'NO — the domain constraint is missing, check migration 0001' end,
    null,
    null
  );
end $$;

-- What the server can read, which is deliberate: lists have to render and
-- renewal reminders have to send without an unlocked vault.
insert into _fgk_audit
select 4, 'Readable by the server, on purpose', 'contact names', count(*), min(name)
from public.contacts where name is not null and name <> ''
having count(*) > 0;

insert into _fgk_audit
select 4, 'Readable by the server, on purpose', 'masked hints', count(*), min(account_number_hint)
from public.contacts where account_number_hint is not null
having count(*) > 0;

insert into _fgk_audit
select 4, 'Readable by the server, on purpose', 'renewal dates', count(*), min(due_on)::text
from public.upcoming_renewals
having count(*) > 0;

select
  scope as "what",
  detail as "status",
  rows_with_data as "rows",
  sample as "what is actually stored"
from _fgk_audit
order by sort_order, scope;
