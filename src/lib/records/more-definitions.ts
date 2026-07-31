/**
 * The remaining categories.
 *
 * All of these are definitions rather than screens, which was the point of
 * building the record layer first. The only judgement in here is which fields
 * belong in `core` — the handful someone will actually fill in — and which can
 * wait behind "Add more details".
 */

import type { FormValues, RecordDefinition } from './definition';

function text(values: FormValues, name: string): string {
  const value = values[name];
  return typeof value === 'string' ? value.trim() : '';
}

function summary(parts: (string | undefined | false)[]): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ');
}

function labelFor(options: { value: string; label: string }[], value: string): string | undefined {
  return options.find((option) => option.value === value)?.label;
}

// ---------------------------------------------------------------------------
// Health — children of a person
// ---------------------------------------------------------------------------

export const healthProvidersDefinition: RecordDefinition = {
  table: 'health_providers',
  slug: 'providers',
  singular: 'Provider',
  plural: 'Doctors and providers',
  emptyMessage: 'Nobody recorded yet.',
  titleField: 'provider_name',
  parentColumn: 'member_id',

  fields: [
    { name: 'provider_name', label: 'Name', kind: 'text', group: 'core', required: true },
    {
      name: 'specialty',
      label: 'What are they?',
      kind: 'combo',
      group: 'core',
      options: [
        'Primary care',
        'Dentist',
        'Optometrist',
        'Pharmacy',
        'Cardiologist',
        'Dermatologist',
        'Therapist',
        'Physical therapist',
        'Paediatrician',
        'OB-GYN',
        'Hospital',
      ].map((value) => ({ value, label: value })),
      help: 'A list, not three fixed slots — people have more than one specialist.',
    },
    { name: 'phone', label: 'Phone', kind: 'phone', group: 'core' },

    { name: 'practice_name', label: 'Practice', kind: 'text', group: 'more' },
    { name: 'address', label: 'Address', kind: 'textarea', group: 'more' },
    { name: 'portal_url', label: 'Patient portal', kind: 'url', group: 'more' },
    {
      name: 'medical_record_number',
      label: 'Medical record number',
      kind: 'text',
      secret: true,
      group: 'more',
    },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],
};

const HEALTH_FACT_TYPES = [
  { value: 'allergy', label: 'Allergy' },
  { value: 'medication', label: 'Medication' },
  { value: 'condition', label: 'Condition' },
  { value: 'immunization', label: 'Immunization' },
  { value: 'surgery', label: 'Surgery' },
];

export const healthFactsDefinition: RecordDefinition = {
  table: 'health_facts',
  slug: 'health-facts',
  singular: 'Health note',
  plural: 'Allergies, medications, conditions',
  emptyMessage: 'Nothing recorded yet.',
  titleField: 'name',
  parentColumn: 'member_id',

  fields: [
    { name: 'fact_type', label: 'What kind?', kind: 'select', group: 'core', options: HEALTH_FACT_TYPES },
    {
      name: 'name',
      label: 'What is it?',
      kind: 'text',
      group: 'core',
      required: true,
      placeholder: 'Penicillin',
    },
    {
      name: 'show_in_emergency',
      label: 'Show on the emergency screen',
      kind: 'boolean',
      group: 'core',
      help: 'For the things a paramedic needs in ten seconds.',
    },

    { name: 'severity', label: 'How severe?', kind: 'text', group: 'more' },
    { name: 'reaction', label: 'What happens?', kind: 'text', group: 'more' },
    { name: 'dosage', label: 'Dose', kind: 'text', group: 'more' },
    { name: 'frequency', label: 'How often?', kind: 'text', group: 'more' },
    { name: 'occurred_on', label: 'Date', kind: 'date', group: 'more' },
    { name: 'expires_on', label: 'Expires or runs out', kind: 'date', group: 'more' },
    { name: 'is_active', label: 'Still current', kind: 'boolean', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
  ],

  createDefaults: { fact_type: 'allergy' },
};

// ---------------------------------------------------------------------------
// Education — children of a person
// ---------------------------------------------------------------------------

export const educationDefinition: RecordDefinition = {
  table: 'education_records',
  slug: 'education',
  singular: 'School',
  plural: 'School',
  emptyMessage: 'Nothing recorded yet.',
  titleField: 'school_name',
  parentColumn: 'member_id',

  fields: [
    { name: 'school_name', label: 'School', kind: 'text', group: 'core', required: true },
    { name: 'grade', label: 'Grade', kind: 'text', group: 'core' },
    { name: 'homeroom_teacher', label: 'Teacher', kind: 'text', group: 'core' },
    { name: 'portal_url', label: 'Parent portal', kind: 'url', group: 'core' },
    {
      name: 'authorized_pickup',
      label: 'Who may collect them?',
      kind: 'textarea',
      group: 'core',
      help: 'Schools ask for this every year and nobody ever has it to hand.',
    },

    { name: 'district', label: 'District', kind: 'text', group: 'more' },
    {
      name: 'level',
      label: 'Level',
      kind: 'combo',
      group: 'more',
      options: ['Daycare', 'Preschool', 'Elementary', 'Middle', 'High', 'College', 'Other'].map(
        (value) => ({ value, label: value }),
      ),
    },
    { name: 'student_id', label: 'Student ID', kind: 'text', secret: true, group: 'more' },
    { name: 'bus_route', label: 'Bus route', kind: 'text', group: 'more' },
    { name: 'bus_stop_time', label: 'Bus stop time', kind: 'text', group: 'more' },
    { name: 'school_hours', label: 'School hours', kind: 'text', group: 'more' },
    { name: 'calendar_url', label: 'School calendar', kind: 'url', group: 'more' },
    { name: 'counselor', label: 'Counsellor', kind: 'text', group: 'more' },
    { name: 'nurse', label: 'Nurse', kind: 'text', group: 'more' },
    { name: 'principal', label: 'Principal', kind: 'text', group: 'more' },
    { name: 'has_iep', label: 'Has an IEP', kind: 'boolean', group: 'more' },
    { name: 'has_504', label: 'Has a 504 plan', kind: 'boolean', group: 'more' },
    { name: 'case_manager', label: 'Case manager', kind: 'text', group: 'more' },
    { name: 'lunch_account_number', label: 'Lunch account', kind: 'text', group: 'more' },
    { name: 'library_name', label: 'Library', kind: 'text', group: 'more' },
    { name: 'library_card_number', label: 'Library card', kind: 'text', secret: true, group: 'more' },
    {
      name: 'provider_tax_id',
      label: 'Provider tax ID',
      kind: 'text',
      secret: true,
      group: 'more',
      help: 'Needed every April for the childcare credit.',
    },
    { name: 'tuition_cents', label: 'Tuition', kind: 'money', group: 'more' },
    { name: 'tuition_frequency', label: 'Tuition paid', kind: 'text', group: 'more' },
    { name: 'fafsa_id', label: 'FAFSA ID', kind: 'text', secret: true, group: 'more' },
    { name: 'advisor', label: 'Advisor', kind: 'text', group: 'more' },
    { name: 'expected_graduation_year', label: 'Graduates in', kind: 'number', group: 'more' },
    { name: 'started_on', label: 'Started', kind: 'date', group: 'more' },
    { name: 'ended_on', label: 'Ended', kind: 'date', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],
};

export const activitiesDefinition: RecordDefinition = {
  table: 'activities',
  slug: 'activities',
  singular: 'Activity',
  plural: 'Activities',
  emptyMessage: 'Nothing recorded yet.',
  titleField: 'name',
  parentColumn: 'member_id',
  // Nothing here is worth sealing, and the table carries no content key.
  contentKey: false,

  fields: [
    { name: 'name', label: 'What is it?', kind: 'text', group: 'core', required: true, placeholder: 'Soccer' },
    {
      name: 'category',
      label: 'Kind',
      kind: 'combo',
      group: 'core',
      options: ['Sport', 'Music', 'Tutoring', 'Club', 'Camp'].map((value) => ({ value, label: value })),
    },
    { name: 'schedule', label: 'When?', kind: 'text', group: 'core' },
    { name: 'location', label: 'Where?', kind: 'text', group: 'core' },

    { name: 'season_starts_on', label: 'Season starts', kind: 'date', group: 'more' },
    { name: 'season_ends_on', label: 'Season ends', kind: 'date', group: 'more' },
    { name: 'cost_cents', label: 'Cost', kind: 'money', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
  ],
};

// ---------------------------------------------------------------------------
// Phone and internet
// ---------------------------------------------------------------------------

const SERVICE_KINDS = [
  { value: 'internet', label: 'Internet' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'landline', label: 'Landline' },
  { value: 'tv', label: 'TV' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
];

const phoneLinesDefinition: RecordDefinition = {
  table: 'phone_lines',
  slug: 'lines',
  singular: 'Line',
  plural: 'Lines',
  emptyMessage: 'No lines recorded yet.',
  titleField: 'phone_number',
  parentColumn: 'service_id',

  fields: [
    { name: 'phone_number', label: 'Phone number', kind: 'phone', group: 'core' },
    { name: 'device_make', label: 'Device make', kind: 'text', group: 'core' },
    { name: 'device_model', label: 'Device model', kind: 'text', group: 'core' },

    { name: 'imei', label: 'IMEI', kind: 'text', group: 'more' },
    { name: 'purchased_on', label: 'Bought on', kind: 'date', group: 'more' },
    { name: 'protection_plan', label: 'Protection plan', kind: 'text', group: 'more' },
    { name: 'upgrade_eligible_on', label: 'Upgrade eligible', kind: 'date', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
  ],
};

export const communicationDefinition: RecordDefinition = {
  table: 'communication_services',
  slug: 'connections',
  singular: 'Service',
  plural: 'Phone and internet',
  emptyMessage:
    'Your internet, mobile, and landline accounts — including the PIN every support call asks for.',
  titleField: 'label',
  subtitleField: 'vendor_name',
  homeGroup: 'home',

  fields: [
    {
      name: 'label',
      label: 'What is it?',
      kind: 'text',
      group: 'core',
      required: true,
      placeholder: 'Family mobile plan',
    },
    { name: 'service_kind', label: 'Kind', kind: 'select', group: 'core', options: SERVICE_KINDS },
    { name: 'vendor_name', label: 'Company', kind: 'text', group: 'core' },
    { name: 'support_phone', label: 'Support phone', kind: 'phone', group: 'core' },
    {
      name: 'account_number',
      label: 'Account number',
      kind: 'text',
      secret: true,
      hintColumn: 'account_number_hint',
      group: 'core',
    },
    {
      name: 'account_pin',
      label: 'Account PIN',
      kind: 'text',
      secret: true,
      group: 'core',
      help: 'Required for every support call and every number port, and the reason porting a number turns into a two-hour ordeal.',
    },

    { name: 'portal_url', label: 'Login page', kind: 'url', group: 'more' },
    { name: 'installed_on', label: 'Installed on', kind: 'date', group: 'more' },
    { name: 'monthly_cost_cents', label: 'Monthly cost', kind: 'money', group: 'more' },
    { name: 'equipment_make', label: 'Router or modem make', kind: 'text', group: 'more' },
    { name: 'equipment_model', label: 'Model', kind: 'text', group: 'more' },
    { name: 'equipment_serial', label: 'Serial number', kind: 'text', group: 'more' },
    { name: 'admin_url', label: 'Router admin page', kind: 'url', group: 'more' },
    { name: 'admin_password', label: 'Router admin password', kind: 'text', secret: true, group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],

  createDefaults: { service_kind: 'other' },

  children: [
    {
      definition: phoneLinesDefinition,
      title: 'Lines and devices',
      emptyMessage: 'Who has which number, and which handset.',
      addLabel: 'Add a line',
      summarize: (values) =>
        summary([
          text(values, 'phone_number'),
          summary([text(values, 'device_make'), text(values, 'device_model')]),
        ]),
    },
  ],
};

export const wifiDefinition: RecordDefinition = {
  table: 'wifi_networks',
  slug: 'wifi',
  singular: 'Network',
  plural: 'WiFi',
  emptyMessage: 'No networks recorded yet.',
  titleField: 'ssid',
  parentColumn: 'property_id',

  fields: [
    { name: 'ssid', label: 'Network name', kind: 'text', group: 'core', required: true },
    { name: 'password', label: 'Password', kind: 'text', secret: true, group: 'core' },
    { name: 'is_guest', label: 'Guest network', kind: 'boolean', group: 'core' },

    {
      name: 'security',
      label: 'Security',
      kind: 'combo',
      group: 'more',
      options: ['WPA', 'WPA2', 'WPA3', 'WEP', 'nopass'].map((value) => ({ value, label: value })),
      help: 'Needed to build a working join code.',
    },
    { name: 'band', label: 'Band', kind: 'text', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],
};

// ---------------------------------------------------------------------------
// Pets
// ---------------------------------------------------------------------------

export const petsDefinition: RecordDefinition = {
  table: 'pets',
  slug: 'pets',
  singular: 'Pet',
  plural: 'Pets',
  emptyMessage:
    'Microchip numbers, rabies dates, and the after-hours vet — the things you need at eleven on a Sunday night.',
  titleField: 'name',
  subtitleField: 'species',
  homeGroup: 'family',

  fields: [
    { name: 'name', label: 'Name', kind: 'text', group: 'core', required: true, placeholder: 'Biscuit' },
    {
      name: 'species',
      label: 'What are they?',
      kind: 'combo',
      group: 'core',
      options: ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish', 'Reptile', 'Horse', 'Other'].map((value) => ({
        value,
        label: value,
      })),
    },
    { name: 'breed', label: 'Breed', kind: 'text', group: 'core' },
    {
      name: 'microchip_number',
      label: 'Microchip number',
      kind: 'text',
      group: 'core',
      help: 'The single field most likely to get a lost pet home.',
    },
    { name: 'rabies_expires_on', label: 'Rabies shot expires', kind: 'date', group: 'core' },

    { name: 'microchip_registry', label: 'Microchip registry', kind: 'text', group: 'more' },
    { name: 'sex', label: 'Sex', kind: 'text', group: 'more' },
    { name: 'color_markings', label: 'Colour and markings', kind: 'text', group: 'more' },
    { name: 'date_of_birth', label: 'Date of birth', kind: 'date', group: 'more' },
    { name: 'adopted_on', label: 'Adopted on', kind: 'date', group: 'more' },
    { name: 'weight', label: 'Weight', kind: 'text', group: 'more' },
    { name: 'is_fixed', label: 'Spayed or neutered', kind: 'boolean', group: 'more' },
    { name: 'license_number', label: 'Licence number', kind: 'text', group: 'more' },
    { name: 'license_expires_on', label: 'Licence expires', kind: 'date', group: 'more' },
    { name: 'rabies_tag_number', label: 'Rabies tag number', kind: 'text', group: 'more' },
    { name: 'food_brand', label: 'Food', kind: 'text', group: 'more' },
    { name: 'food_amount', label: 'How much', kind: 'text', group: 'more' },
    { name: 'feeding_schedule', label: 'Feeding schedule', kind: 'text', group: 'more' },
    { name: 'medications', label: 'Medications', kind: 'textarea', group: 'more' },
    { name: 'allergies', label: 'Allergies', kind: 'textarea', group: 'more' },
    { name: 'conditions', label: 'Conditions', kind: 'textarea', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],
};

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export const subscriptionsDefinition: RecordDefinition = {
  table: 'subscriptions',
  slug: 'subscriptions',
  singular: 'Subscription',
  plural: 'Subscriptions',
  emptyMessage:
    'What renews, when, and how to cancel it — including the free trial that is about to become a charge.',
  titleField: 'name',
  subtitleField: 'category',
  homeGroup: 'money',

  fields: [
    {
      name: 'name',
      label: 'What is it?',
      kind: 'combo',
      group: 'core',
      required: true,
      options: [
        'Netflix',
        'Hulu',
        'Disney+',
        'Max',
        'Spotify',
        'Apple One',
        'YouTube Premium',
        'Amazon Prime',
        'Costco',
        'Sam’s Club',
        "BJ's",
        'New York Times',
      ].map((value) => ({ value, label: value })),
      help: 'Pick one or type your own.',
    },
    {
      name: 'category',
      label: 'Kind',
      kind: 'combo',
      group: 'core',
      options: ['Entertainment', 'Shopping', 'Software', 'News', 'Fitness', 'Other'].map((value) => ({
        value,
        label: value,
      })),
    },
    { name: 'cost_cents', label: 'Cost', kind: 'money', group: 'core' },
    {
      name: 'billing_frequency',
      label: 'Billed',
      kind: 'combo',
      group: 'core',
      options: ['Monthly', 'Annually', 'Quarterly', 'Weekly'].map((value) => ({ value, label: value })),
    },
    { name: 'renews_on', label: 'Renews on', kind: 'date', group: 'core' },
    {
      name: 'trial_ends_on',
      label: 'Free trial ends',
      kind: 'date',
      group: 'core',
      help: 'The alert people actually want from a subscription tracker.',
    },

    { name: 'account_email', label: 'Account email', kind: 'email', group: 'more' },
    { name: 'cancel_url', label: 'How to cancel', kind: 'url', group: 'more' },
    { name: 'shared_with', label: 'Shared with', kind: 'text', group: 'more' },
    { name: 'started_on', label: 'Started on', kind: 'date', group: 'more' },
    { name: 'is_active', label: 'Still active', kind: 'boolean', group: 'more' },
    { name: 'cancelled_on', label: 'Cancelled on', kind: 'date', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],
};

// ---------------------------------------------------------------------------
// Estate and legal
// ---------------------------------------------------------------------------

const ESTATE_DOCUMENT_TYPES = [
  { value: 'will', label: 'Will' },
  { value: 'trust', label: 'Trust' },
  { value: 'financial_power_of_attorney', label: 'Financial power of attorney' },
  { value: 'healthcare_power_of_attorney', label: 'Healthcare power of attorney' },
  { value: 'living_will', label: 'Living will' },
  { value: 'advance_directive', label: 'Advance directive' },
  { value: 'dnr', label: 'DNR' },
  { value: 'guardianship_designation', label: 'Guardian for the children' },
  { value: 'funeral_instructions', label: 'Funeral instructions' },
  { value: 'cemetery_plot', label: 'Cemetery plot' },
  { value: 'organ_donor', label: 'Organ donor' },
  { value: 'digital_legacy', label: 'Digital legacy' },
  { value: 'safe_deposit_box', label: 'Safe deposit box' },
  { value: 'home_safe', label: 'Home safe' },
  { value: 'other', label: 'Other' },
];

export const estateDefinition: RecordDefinition = {
  table: 'estate_records',
  slug: 'estate',
  singular: 'Document',
  plural: 'Estate and legal',
  emptyMessage:
    'Wills, directives, and where the signed originals actually live. Arguably the reason a vault like this exists.',
  titleField: 'title',
  homeGroup: 'life',

  fields: [
    {
      name: 'document_type',
      label: 'What is it?',
      kind: 'select',
      group: 'core',
      options: ESTATE_DOCUMENT_TYPES,
    },
    { name: 'title', label: 'Name it', kind: 'text', group: 'core', placeholder: "Dana's will" },
    {
      name: 'physical_location',
      label: 'Where is the signed original?',
      kind: 'text',
      group: 'core',
      help: 'Frequently the only thing anyone needs to know.',
    },
    {
      name: 'responsible_party_name',
      label: 'Who is responsible?',
      kind: 'text',
      group: 'core',
      help: 'Executor, trustee, agent, or guardian, depending on the document.',
    },
    { name: 'executed_on', label: 'Signed on', kind: 'date', group: 'core' },

    { name: 'reviewed_on', label: 'Last reviewed', kind: 'date', group: 'more' },
    { name: 'box_or_safe_number', label: 'Box or safe number', kind: 'text', group: 'more' },
    { name: 'access_code', label: 'Combination or access code', kind: 'text', secret: true, group: 'more' },
    { name: 'key_location', label: 'Where is the key?', kind: 'text', group: 'more' },
    { name: 'instructions', label: 'Instructions', kind: 'textarea', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],

  createDefaults: { document_type: 'other' },
};

// ---------------------------------------------------------------------------
// Valuables
// ---------------------------------------------------------------------------

export const valuablesDefinition: RecordDefinition = {
  table: 'valuables',
  slug: 'valuables',
  singular: 'Item',
  plural: 'Valuables',
  emptyMessage:
    'What an insurer asks for after a fire. Reconstructing this from memory is how families get underpaid on a claim.',
  titleField: 'name',
  subtitleField: 'category',
  homeGroup: 'life',

  fields: [
    { name: 'name', label: 'What is it?', kind: 'text', group: 'core', required: true },
    {
      name: 'category',
      label: 'Kind',
      kind: 'combo',
      group: 'core',
      options: ['Jewellery', 'Art', 'Electronics', 'Instrument', 'Collectible', 'Firearm', 'Other'].map(
        (value) => ({ value, label: value }),
      ),
    },
    { name: 'serial_number', label: 'Serial number', kind: 'text', secret: true, group: 'core' },
    { name: 'appraised_value_cents', label: 'What is it worth?', kind: 'money', group: 'core' },
    { name: 'location', label: 'Where is it?', kind: 'text', group: 'core' },

    { name: 'description', label: 'Description', kind: 'textarea', group: 'more' },
    { name: 'purchased_on', label: 'Bought on', kind: 'date', group: 'more' },
    { name: 'purchase_price_cents', label: 'What it cost', kind: 'money', group: 'more' },
    { name: 'appraised_on', label: 'Appraised on', kind: 'date', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],
};

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

export const membershipsDefinition: RecordDefinition = {
  table: 'memberships',
  slug: 'memberships',
  singular: 'Membership',
  plural: 'Memberships',
  emptyMessage:
    'Gyms, warehouse clubs, roadside assistance, professional licences — and the dates they lapse.',
  titleField: 'name',
  subtitleField: 'category',
  homeGroup: 'life',

  fields: [
    { name: 'name', label: 'What is it?', kind: 'text', group: 'core', required: true, placeholder: 'AAA' },
    {
      name: 'category',
      label: 'Kind',
      kind: 'combo',
      group: 'core',
      options: [
        'Gym',
        'Warehouse club',
        'Roadside assistance',
        'Museum',
        'Alumni',
        'Professional licence',
        'Other',
      ].map((value) => ({ value, label: value })),
    },
    {
      name: 'membership_number',
      label: 'Membership number',
      kind: 'text',
      secret: true,
      hintColumn: 'membership_number_hint',
      group: 'core',
    },
    {
      name: 'support_phone',
      label: 'Phone',
      kind: 'phone',
      group: 'core',
      help: "For roadside assistance this is the whole reason the membership exists.",
    },
    { name: 'expires_on', label: 'Expires on', kind: 'date', group: 'core' },

    { name: 'started_on', label: 'Started on', kind: 'date', group: 'more' },
    { name: 'cost_cents', label: 'Cost', kind: 'money', group: 'more' },
    { name: 'cost_frequency', label: 'Paid', kind: 'text', group: 'more' },
    { name: 'auto_renews', label: 'Renews automatically', kind: 'boolean', group: 'more' },
    { name: 'licensing_authority', label: 'Licensing authority', kind: 'text', group: 'more' },
    {
      name: 'continuing_education_due_on',
      label: 'Continuing education due',
      kind: 'date',
      group: 'more',
    },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],
};

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

export const travelDefinition: RecordDefinition = {
  table: 'loyalty_programs',
  slug: 'travel',
  singular: 'Programme',
  plural: 'Travel',
  emptyMessage: 'Frequent flyer and hotel numbers, for the booking form that wants them.',
  titleField: 'program_name',
  subtitleField: 'category',
  homeGroup: 'life',

  fields: [
    { name: 'program_name', label: 'Programme', kind: 'text', group: 'core', required: true },
    {
      name: 'category',
      label: 'Kind',
      kind: 'combo',
      group: 'core',
      options: ['Airline', 'Hotel', 'Rental car', 'Rail', 'Cruise'].map((value) => ({
        value,
        label: value,
      })),
    },
    {
      name: 'membership_number',
      label: 'Number',
      kind: 'text',
      secret: true,
      hintColumn: 'membership_number_hint',
      group: 'core',
    },
    { name: 'status_tier', label: 'Status', kind: 'text', group: 'core' },

    { name: 'points_balance', label: 'Points', kind: 'text', group: 'more' },
    { name: 'points_as_of', label: 'Points as of', kind: 'date', group: 'more' },
    { name: 'portal_url', label: 'Login page', kind: 'url', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
  ],
};

// ---------------------------------------------------------------------------
// Sections attached to People and Homes
// ---------------------------------------------------------------------------

export const PERSON_CHILD_SECTIONS = [
  {
    definition: healthProvidersDefinition,
    title: 'Doctors and providers',
    emptyMessage: 'Their GP, dentist, pharmacy, and any specialists.',
    addLabel: 'Add a provider',
    summarize: (values: FormValues) =>
      summary([text(values, 'provider_name'), text(values, 'specialty'), text(values, 'phone')]),
  },
  {
    definition: healthFactsDefinition,
    title: 'Allergies, medications, conditions',
    emptyMessage: 'The things a paramedic would want to know in ten seconds.',
    addLabel: 'Add a health note',
    summarize: (values: FormValues) =>
      summary([
        labelFor(HEALTH_FACT_TYPES, text(values, 'fact_type')),
        text(values, 'name'),
        text(values, 'dosage'),
      ]),
  },
  {
    definition: educationDefinition,
    title: 'School',
    emptyMessage: 'The portal, the bus route, and who is allowed to collect them.',
    addLabel: 'Add a school',
    summarize: (values: FormValues) =>
      summary([text(values, 'school_name'), text(values, 'grade')]),
  },
  {
    definition: activitiesDefinition,
    title: 'Activities',
    emptyMessage: 'Sports, music, clubs, camps.',
    addLabel: 'Add an activity',
    summarize: (values: FormValues) =>
      summary([text(values, 'name'), text(values, 'schedule')]),
  },
];

export const HOME_WIFI_SECTION = {
  definition: wifiDefinition,
  title: 'WiFi',
  emptyMessage: 'The network name and password, so you never read them off a router again.',
  addLabel: 'Add a network',
  summarize: (values: FormValues) =>
    summary([text(values, 'ssid'), values.is_guest === true && 'guest network']),
};

export const MORE_DEFINITIONS = [
  communicationDefinition,
  petsDefinition,
  subscriptionsDefinition,
  estateDefinition,
  valuablesDefinition,
  membershipsDefinition,
  travelDefinition,
];

export const MORE_CHILD_DEFINITIONS = [
  healthProvidersDefinition,
  healthFactsDefinition,
  educationDefinition,
  activitiesDefinition,
  phoneLinesDefinition,
  wifiDefinition,
];
