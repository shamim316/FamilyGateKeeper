-- The nine categories from the product plan, plus the ones the plan added:
-- estate, valuables, memberships, travel, and the trusted circle.

-- ---------------------------------------------------------------------------
-- Household members
-- ---------------------------------------------------------------------------

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  wrapped_cek app.sealed not null,

  -- The only genuinely required field in the entire schema. Someone should be
  -- able to write "Mom" and fill in the rest whenever they get to it.
  display_name text not null,
  legal_name text,
  preferred_name text,
  relationship text,

  date_of_birth date,
  place_of_birth text,
  citizenship text,

  phone text,
  email text,
  photo_attachment_id uuid,

  -- Kept with the person rather than in Health, because these are what someone
  -- reads off a phone screen in an ambulance.
  blood_type text,
  height text,
  weight text,
  eye_color text,

  employer text,
  work_phone text,
  hr_contact_id uuid references public.contacts (id) on delete set null,

  emergency_contact_id uuid references public.contacts (id) on delete set null,

  -- Social security numbers are the single most sensitive value in the app.
  ssn app.sealed,
  ssn_card_location text,

  is_deceased boolean not null default false,
  date_of_death date,

  notes text,
  last_verified_at date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index household_members_family_idx on public.household_members (family_id);

-- Every government ID in one table, because they all share the same shape and
-- the same reason for existing: a number, an issuer, and an expiration date
-- somebody needs to be warned about.
create type app.identification_type as enum (
  'drivers_license', 'state_id', 'passport', 'passport_card',
  'birth_certificate', 'social_security_card', 'global_entry',
  'tsa_precheck', 'nexus', 'military_id', 'permanent_resident_card',
  'visa', 'naturalization_certificate', 'marriage_certificate',
  'concealed_carry', 'other'
);

create table public.member_identifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  wrapped_cek app.sealed not null,

  identification_type app.identification_type not null,
  label text,

  document_number app.sealed,
  document_number_hint text,

  issuing_authority text,
  issued_on date,
  expires_on date,

  -- Driver's licenses
  license_class text,
  is_real_id boolean,

  -- Where the paper original is. Often the only thing anyone actually needs.
  physical_location text,

  details jsonb not null default '{}'::jsonb,

  notes text,
  last_verified_at date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_identifications_member_idx on public.member_identifications (member_id);
create index member_identifications_expiry_idx
  on public.member_identifications (family_id, expires_on) where expires_on is not null;

-- ---------------------------------------------------------------------------
-- Health
-- ---------------------------------------------------------------------------

create table public.health_providers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid references public.household_members (id) on delete cascade,
  wrapped_cek app.sealed not null,

  contact_id uuid references public.contacts (id) on delete set null,
  provider_name text not null,
  -- Primary care, dentist, optometrist, cardiologist, therapist, pharmacy,
  -- preferred hospital. A list, not three fixed slots.
  specialty text,
  practice_name text,
  phone text,
  address text,
  portal_url text,
  medical_record_number app.sealed,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index health_providers_member_idx on public.health_providers (family_id, member_id);

-- Allergies, medications, and conditions share a table: they are all "a thing
-- about this person's health that an emergency responder needs in ten seconds".
create type app.health_fact_type as enum (
  'allergy', 'medication', 'condition', 'immunization', 'surgery'
);

create table public.health_facts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  wrapped_cek app.sealed not null,

  fact_type app.health_fact_type not null,
  name text not null,

  -- Medications
  dosage text,
  frequency text,
  prescriber_id uuid references public.health_providers (id) on delete set null,
  pharmacy_id uuid references public.health_providers (id) on delete set null,

  -- Allergies
  severity text,
  reaction text,

  occurred_on date,
  -- Immunizations and prescriptions that lapse.
  expires_on date,

  is_active boolean not null default true,
  -- Surfaced on the emergency screen. Not every fact belongs there.
  show_in_emergency boolean not null default false,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index health_facts_member_idx on public.health_facts (family_id, member_id, fact_type);
create index health_facts_emergency_idx
  on public.health_facts (family_id) where show_in_emergency;

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  wrapped_cek app.sealed not null,

  nickname text not null,
  make text,
  model text,
  trim text,
  year smallint,
  color text,
  body_style text,

  vin app.sealed,
  vin_hint text,
  license_plate text,
  plate_state text,

  primary_driver_id uuid references public.household_members (id) on delete set null,

  registration_starts_on date,
  registration_expires_on date,
  inspection_due_on date,

  title_number app.sealed,
  title_location text,

  -- Loan or lease
  lienholder_contact_id uuid references public.contacts (id) on delete set null,
  loan_account_id uuid references public.financial_accounts (id) on delete set null,
  lease_ends_on date,
  lease_mileage_cap integer,

  purchased_on date,
  purchase_price_cents bigint,
  dealer_contact_id uuid references public.contacts (id) on delete set null,

  odometer integer,
  odometer_as_of date,
  next_service_on date,
  next_service_odometer integer,
  preferred_shop_contact_id uuid references public.contacts (id) on delete set null,
  roadside_contact_id uuid references public.contacts (id) on delete set null,

  -- The parts-counter fields. They look trivial and are among the most-opened
  -- screens in an app like this.
  tire_size text,
  oil_type text,
  battery_group text,
  wiper_size text,
  key_fob_count smallint,
  key_code app.sealed,
  spare_key_location text,

  toll_transponder_account app.sealed,
  parking_permit text,

  notes text,
  last_verified_at date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicles_family_idx on public.vehicles (family_id);
create index vehicles_registration_idx
  on public.vehicles (family_id, registration_expires_on) where registration_expires_on is not null;

-- A log, not a "date of last maintenance" column. Overwriting the previous
-- service loses exactly the history that matters when selling the car or
-- arguing with a shop about a warranty.
create table public.vehicle_service_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,

  serviced_on date not null,
  odometer integer,
  service_type text,
  description text,
  vendor_contact_id uuid references public.contacts (id) on delete set null,
  vendor_name text,
  cost_cents bigint,
  warranty_expires_on date,

  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicle_service_records_vehicle_idx
  on public.vehicle_service_records (vehicle_id, serviced_on desc);

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------

create type app.property_kind as enum (
  'primary_residence', 'second_home', 'rental_owned', 'rented', 'land', 'other'
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  wrapped_cek app.sealed not null,

  nickname text not null,
  property_kind app.property_kind not null default 'primary_residence',

  -- The original field list had a nickname and no address.
  street_address text,
  city text,
  state text,
  postal_code text,
  country text default 'US',

  built_on date,
  purchased_on date,
  purchase_price_cents bigint,
  square_feet integer,
  lot_size text,
  bedrooms numeric(4, 1),
  bathrooms numeric(4, 1),

  zillow_url text,
  parcel_number text,
  legal_description text,
  deed_location text,

  -- Mortgage and taxes
  mortgage_account_id uuid references public.financial_accounts (id) on delete set null,
  heloc_account_id uuid references public.financial_accounts (id) on delete set null,
  tax_assessor_account text,
  annual_property_tax_cents bigint,
  tax_due_dates text,
  homestead_exemption boolean,

  -- HOA
  hoa_contact_id uuid references public.contacts (id) on delete set null,
  hoa_dues_cents bigint,
  hoa_dues_frequency text,

  -- Renting
  landlord_contact_id uuid references public.contacts (id) on delete set null,
  lease_starts_on date,
  lease_ends_on date,
  rent_cents bigint,
  security_deposit_cents bigint,

  -- Security system
  security_contact_id uuid references public.contacts (id) on delete set null,
  alarm_code app.sealed,
  duress_code app.sealed,
  alarm_permit_number text,

  -- Garage
  garage_opener_make text,
  garage_opener_model text,
  garage_opener_serial text,
  garage_code app.sealed,

  -- The questions asked during an actual emergency.
  water_shutoff_location text,
  gas_shutoff_location text,
  breaker_panel_location text,

  trash_pickup_day text,
  recycling_pickup_day text,
  spare_key_holder_contact_id uuid references public.contacts (id) on delete set null,
  neighbor_contact_id uuid references public.contacts (id) on delete set null,

  notes text,
  last_verified_at date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_family_idx on public.properties (family_id);

create type app.utility_kind as enum (
  'electric', 'gas', 'water', 'sewer', 'septic', 'garbage', 'recycling',
  'propane', 'well', 'solar', 'internet', 'other'
);

create table public.property_utilities (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  wrapped_cek app.sealed not null,

  utility_kind app.utility_kind not null,
  vendor_contact_id uuid references public.contacts (id) on delete set null,
  vendor_name text,
  account_number app.sealed,
  account_number_hint text,
  meter_number text,
  portal_url text,
  autopay boolean,
  average_monthly_cents bigint,
  shutoff_location text,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index property_utilities_property_idx on public.property_utilities (property_id);

-- Appliances and building systems. Warranty dates and filter sizes are the
-- reason this table earns its keep.
create table public.appliances (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  wrapped_cek app.sealed not null,

  name text not null,
  -- HVAC, water heater, furnace, roof, washer, sump pump, generator...
  category text,
  location text,

  brand text,
  model_number text,
  serial_number text,

  purchased_on date,
  installed_on date,
  warranty_expires_on date,
  expected_life_years smallint,

  filter_size text,
  filter_interval_months smallint,
  filter_last_changed_on date,

  service_contact_id uuid references public.contacts (id) on delete set null,
  manual_url text,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appliances_property_idx on public.appliances (property_id);
create index appliances_warranty_idx
  on public.appliances (family_id, warranty_expires_on) where warranty_expires_on is not null;

-- Paint colors, flooring, tile. Perennially wanted, never written down.
create table public.property_finishes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,

  room text,
  -- paint, flooring, tile, countertop, cabinet hardware, grout
  finish_type text not null,
  brand text,
  color_name text,
  color_code text,
  sheen text,
  product_details text,
  applied_on date,
  vendor_contact_id uuid references public.contacts (id) on delete set null,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index property_finishes_property_idx on public.property_finishes (property_id);

create table public.property_projects (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,

  title text not null,
  description text,
  contractor_contact_id uuid references public.contacts (id) on delete set null,
  started_on date,
  completed_on date,
  cost_cents bigint,
  permit_number text,
  warranty_expires_on date,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index property_projects_property_idx on public.property_projects (property_id, completed_on desc);

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------

create type app.service_kind as enum (
  'internet', 'mobile', 'landline', 'tv', 'streaming', 'email', 'other'
);

create table public.communication_services (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  wrapped_cek app.sealed not null,

  service_kind app.service_kind not null,
  label text not null,

  vendor_contact_id uuid references public.contacts (id) on delete set null,
  vendor_name text,
  support_phone text,
  account_number app.sealed,
  account_number_hint text,

  -- Required for every support call and every number port, and the reason
  -- porting a number turns into a two-hour ordeal when nobody wrote it down.
  account_pin app.sealed,

  portal_url text,
  installed_on date,
  monthly_cost_cents bigint,

  -- Equipment
  equipment_make text,
  equipment_model text,
  equipment_serial text,
  admin_url text,
  admin_password app.sealed,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index communication_services_family_idx on public.communication_services (family_id);

create table public.phone_lines (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  service_id uuid references public.communication_services (id) on delete cascade,
  wrapped_cek app.sealed not null,

  phone_number text,
  member_id uuid references public.household_members (id) on delete set null,
  device_make text,
  device_model text,
  imei text,
  purchased_on date,
  protection_plan text,
  upgrade_eligible_on date,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index phone_lines_family_idx on public.phone_lines (family_id);

create table public.wifi_networks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  wrapped_cek app.sealed not null,

  ssid text not null,
  password app.sealed,
  -- WPA2, WPA3, or open. Needed to build a correct join QR code.
  security text default 'WPA',
  is_guest boolean not null default false,
  band text,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wifi_networks_family_idx on public.wifi_networks (family_id);

-- ---------------------------------------------------------------------------
-- Education
-- ---------------------------------------------------------------------------

create table public.education_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  wrapped_cek app.sealed not null,

  school_name text not null,
  school_contact_id uuid references public.contacts (id) on delete set null,
  district text,
  -- daycare, preschool, elementary, middle, high, college, other
  level text,
  grade text,
  homeroom_teacher text,

  student_id app.sealed,
  portal_url text,
  school_hours text,
  calendar_url text,

  bus_route text,
  bus_stop_time text,

  counselor text,
  nurse text,
  principal text,

  -- Schools ask for this every year and nobody has it handy.
  authorized_pickup text,

  has_iep boolean,
  has_504 boolean,
  case_manager text,

  lunch_account_number text,
  library_name text,
  library_card_number app.sealed,

  -- Daycare and preschool: needed every April for the childcare tax credit.
  provider_tax_id app.sealed,
  tuition_cents bigint,
  tuition_frequency text,

  -- College
  fafsa_id app.sealed,
  college_savings_account_id uuid references public.financial_accounts (id) on delete set null,
  student_loan_account_id uuid references public.financial_accounts (id) on delete set null,
  advisor text,
  expected_graduation_year smallint,

  started_on date,
  ended_on date,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index education_records_member_idx on public.education_records (family_id, member_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,

  name text not null,
  -- sport, music, tutoring, club, camp
  category text,
  coach_contact_id uuid references public.contacts (id) on delete set null,
  schedule text,
  location text,
  season_starts_on date,
  season_ends_on date,
  cost_cents bigint,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activities_member_idx on public.activities (family_id, member_id);

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  wrapped_cek app.sealed not null,

  name text not null,
  -- entertainment, shopping, software, news, fitness, other
  category text,

  cost_cents bigint,
  -- monthly, annual, quarterly, weekly
  billing_frequency text,
  renews_on date,
  -- The alert people actually want from a subscription tracker.
  trial_ends_on date,

  payment_account_id uuid references public.financial_accounts (id) on delete set null,
  account_email text,
  cancel_url text,
  shared_with text,

  started_on date,
  cancelled_on date,
  is_active boolean not null default true,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_family_idx on public.subscriptions (family_id) where is_active;
create index subscriptions_renewal_idx
  on public.subscriptions (family_id, renews_on) where renews_on is not null;

-- ---------------------------------------------------------------------------
-- Pets
-- ---------------------------------------------------------------------------

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  wrapped_cek app.sealed not null,

  name text not null,
  species text,
  breed text,
  sex text,
  color_markings text,
  date_of_birth date,
  adopted_on date,
  weight text,
  is_fixed boolean,
  photo_attachment_id uuid,

  -- The field that gets a lost pet home.
  microchip_number text,
  microchip_registry text,

  license_number text,
  license_expires_on date,
  rabies_tag_number text,
  rabies_expires_on date,

  vet_contact_id uuid references public.contacts (id) on delete set null,
  -- The regular vet is closed at 11pm on a Sunday, which is when pets get sick.
  emergency_vet_contact_id uuid references public.contacts (id) on delete set null,
  groomer_contact_id uuid references public.contacts (id) on delete set null,
  boarding_contact_id uuid references public.contacts (id) on delete set null,
  sitter_contact_id uuid references public.contacts (id) on delete set null,

  food_brand text,
  food_amount text,
  feeding_schedule text,
  medications text,
  allergies text,
  conditions text,

  is_deceased boolean not null default false,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pets_family_idx on public.pets (family_id);

-- ---------------------------------------------------------------------------
-- Estate and legal
-- ---------------------------------------------------------------------------

create type app.estate_document_type as enum (
  'will', 'trust', 'financial_power_of_attorney', 'healthcare_power_of_attorney',
  'living_will', 'advance_directive', 'dnr', 'guardianship_designation',
  'funeral_instructions', 'cemetery_plot', 'organ_donor', 'digital_legacy',
  'safe_deposit_box', 'home_safe', 'other'
);

create table public.estate_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid references public.household_members (id) on delete cascade,
  wrapped_cek app.sealed not null,

  document_type app.estate_document_type not null,
  title text,

  -- Where the signed original is. Frequently the only thing anyone needs.
  physical_location text,
  executed_on date,
  reviewed_on date,

  attorney_contact_id uuid references public.contacts (id) on delete set null,
  -- Executor, trustee, agent, guardian, depending on document_type.
  responsible_party_contact_id uuid references public.contacts (id) on delete set null,
  responsible_party_name text,

  institution_contact_id uuid references public.contacts (id) on delete set null,
  box_or_safe_number text,
  -- Combinations and where the key is, not the contents.
  access_code app.sealed,
  key_location text,

  instructions text,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index estate_records_family_idx on public.estate_records (family_id);

-- ---------------------------------------------------------------------------
-- Valuables, memberships, travel, trusted circle
-- ---------------------------------------------------------------------------

-- What an insurer demands after a fire. Reconstructing it from memory is how
-- families get underpaid on claims.
create table public.valuables (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  wrapped_cek app.sealed not null,

  name text not null,
  category text,
  description text,
  serial_number app.sealed,
  location text,

  purchased_on date,
  purchase_price_cents bigint,
  appraised_value_cents bigint,
  appraised_on date,
  appraiser_contact_id uuid references public.contacts (id) on delete set null,
  scheduled_on_policy_id uuid references public.policies (id) on delete set null,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index valuables_family_idx on public.valuables (family_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid references public.household_members (id) on delete set null,
  wrapped_cek app.sealed not null,

  name text not null,
  -- gym, warehouse club, roadside, museum, alumni, professional_license
  category text,
  organization_contact_id uuid references public.contacts (id) on delete set null,

  membership_number app.sealed,
  membership_number_hint text,
  -- AAA's roadside number, the reason the membership exists.
  support_phone text,

  started_on date,
  expires_on date,
  cost_cents bigint,
  cost_frequency text,
  auto_renews boolean,

  -- Professional licenses
  licensing_authority text,
  continuing_education_due_on date,

  notes text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memberships_family_idx on public.memberships (family_id);
create index memberships_expiry_idx
  on public.memberships (family_id, expires_on) where expires_on is not null;

create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid references public.household_members (id) on delete set null,
  wrapped_cek app.sealed not null,

  program_name text not null,
  -- airline, hotel, rental_car, rail, cruise
  category text,
  membership_number app.sealed,
  membership_number_hint text,
  status_tier text,
  points_balance text,
  points_as_of date,
  portal_url text,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index loyalty_programs_family_idx on public.loyalty_programs (family_id);
