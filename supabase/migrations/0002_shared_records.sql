-- The three tables that absorb most of the app.
--
-- Every provider in a family's life has the same shape (name, phone, account
-- number), every insurance policy has the same shape, and every financial
-- account has the same shape. Modelling those once rather than repeating
-- "vendor name, phone, account number" across forty columns is what keeps the
-- schema from collapsing under its own weight — and it gives the family a
-- searchable directory for free.

-- ---------------------------------------------------------------------------
-- Contacts: every vendor, provider, agent, contractor, doctor, school, and vet
-- ---------------------------------------------------------------------------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  wrapped_cek app.sealed not null,

  name text not null,
  -- Free text rather than an enum: the day someone needs "pool guy" or
  -- "chimney sweep" should not require a migration. The UI offers a picker of
  -- common values and lets them type anything.
  category text,

  phone text,
  after_hours_phone text,
  email text,
  website text,
  portal_url text,
  address text,

  contact_person text,
  account_number app.sealed,
  account_number_hint text,

  notes text,
  last_verified_at date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.contacts.after_hours_phone is
  'The number that matters at 2am — emergency vet, claims line, on-call plumber.';
comment on column public.contacts.account_number_hint is
  'Plaintext masked form such as "****4821", so lists are readable before unlock.';

create index contacts_family_idx on public.contacts (family_id);
create index contacts_category_idx on public.contacts (family_id, category);

-- ---------------------------------------------------------------------------
-- Policies: every insurance policy of every kind
-- ---------------------------------------------------------------------------

create type app.policy_type as enum (
  'health', 'dental', 'vision', 'life', 'disability', 'long_term_care',
  'auto', 'homeowners', 'renters', 'flood', 'umbrella', 'home_warranty',
  'pet', 'travel', 'other'
);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  wrapped_cek app.sealed not null,

  policy_type app.policy_type not null,
  label text,

  carrier_contact_id uuid references public.contacts (id) on delete set null,
  agent_contact_id uuid references public.contacts (id) on delete set null,
  carrier_name text,

  policy_number app.sealed,
  policy_number_hint text,
  -- Distinct from the policy number, and the one printed on a health card.
  member_id app.sealed,
  group_number app.sealed,

  phone text,
  claims_phone text,

  effective_on date,
  renews_on date,
  expires_on date,

  premium_cents bigint,
  premium_frequency text,
  deductible_cents bigint,
  out_of_pocket_max_cents bigint,
  coverage_amount_cents bigint,

  beneficiaries text,

  -- Per-type extras that do not deserve a column: RxBIN/RxPCN/RxGroup for
  -- health, face amount and term end for life, coverage limits for auto.
  details jsonb not null default '{}'::jsonb,

  notes text,
  last_verified_at date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index policies_family_idx on public.policies (family_id);
create index policies_type_idx on public.policies (family_id, policy_type);
create index policies_renewal_idx on public.policies (family_id, renews_on)
  where renews_on is not null;

-- Which people and things a policy covers. A family auto policy covers three
-- cars and two drivers, so this cannot be a column on either side.
create table public.policy_coverage (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  policy_id uuid not null references public.policies (id) on delete cascade,
  -- Deliberately not a foreign key: the covered thing may be a person, a
  -- vehicle, a property, or a pet.
  subject_type text not null,
  subject_id uuid not null,
  created_at timestamptz not null default now(),
  unique (policy_id, subject_type, subject_id)
);

create index policy_coverage_subject_idx
  on public.policy_coverage (family_id, subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- Financial accounts
-- ---------------------------------------------------------------------------

create type app.account_type as enum (
  'checking', 'savings', 'money_market', 'certificate_of_deposit',
  'credit_card', 'brokerage', 'traditional_ira', 'roth_ira', 'rollover_ira',
  'retirement_401k', 'retirement_403b', 'pension', 'hsa', 'fsa',
  'college_529', 'crypto', 'loan_mortgage', 'loan_auto', 'loan_student',
  'loan_personal', 'heloc', 'safe_deposit_box', 'other'
);

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  wrapped_cek app.sealed not null,

  account_type app.account_type not null,
  nickname text not null,
  institution_contact_id uuid references public.contacts (id) on delete set null,
  institution_name text,

  account_number app.sealed,
  -- Plaintext so a list can show "Chase Checking ****4821" without unlocking.
  account_number_last4 text,
  routing_number app.sealed,

  online_url text,
  phone text,
  -- The collect-call number on the back of a card, useless once it is lost.
  international_phone text,

  owners text,
  beneficiaries text,
  opened_on date,

  -- Credit cards
  card_network text,
  card_expires_on date,
  credit_limit_cents bigint,
  statement_closes_day smallint,
  payment_due_day smallint,
  autopay_from_account_id uuid references public.financial_accounts (id) on delete set null,
  annual_fee_cents bigint,
  rewards_program text,

  -- Loans
  interest_rate numeric(6, 3),
  balance_cents bigint,
  balance_as_of date,
  monthly_payment_cents bigint,
  payoff_on date,

  -- Retirement
  employer_match text,
  vesting_schedule text,

  details jsonb not null default '{}'::jsonb,

  notes text,
  last_verified_at date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint statement_day_is_valid
    check (statement_closes_day is null or statement_closes_day between 1 and 31),
  constraint payment_day_is_valid
    check (payment_due_day is null or payment_due_day between 1 and 31)
);

create index financial_accounts_family_idx on public.financial_accounts (family_id);
create index financial_accounts_type_idx on public.financial_accounts (family_id, account_type);

-- ---------------------------------------------------------------------------
-- Attachments
-- ---------------------------------------------------------------------------

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  wrapped_cek app.sealed not null,

  -- Polymorphic by design: anything in the app can carry a document.
  subject_type text not null,
  subject_id uuid not null,

  -- Path in the Supabase Storage bucket. The object itself is ciphertext.
  storage_path text not null unique,
  filename text not null,
  content_type text,
  size_bytes bigint,

  -- Where the paper original lives. Half the value of a document record is
  -- knowing which drawer to open.
  physical_location text,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index attachments_subject_idx on public.attachments (family_id, subject_type, subject_id);
