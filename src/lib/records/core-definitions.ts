/**
 * The three heaviest categories: the people, the homes, and the cars.
 *
 * Each brings a collection underneath it — ID documents, appliances, a service
 * log — which is the pattern the rest of the app repeats. None of them needed a
 * new screen.
 */

import type { FormValues, RecordDefinition } from './definition';

function text(values: FormValues, name: string): string {
  const value = values[name];
  return typeof value === 'string' ? value.trim() : '';
}

/** Joins the parts of a summary that are actually filled in. */
function summary(parts: (string | undefined | false)[], fallback = ''): string {
  const kept = parts.filter((part): part is string => Boolean(part && part.trim()));
  return kept.length > 0 ? kept.join(' · ') : fallback;
}

// ---------------------------------------------------------------------------
// Household members
// ---------------------------------------------------------------------------

const IDENTIFICATION_TYPES = [
  { value: 'drivers_license', label: "Driver's licence" },
  { value: 'state_id', label: 'State ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'passport_card', label: 'Passport card' },
  { value: 'birth_certificate', label: 'Birth certificate' },
  { value: 'social_security_card', label: 'Social Security card' },
  { value: 'global_entry', label: 'Global Entry' },
  { value: 'tsa_precheck', label: 'TSA PreCheck' },
  { value: 'nexus', label: 'NEXUS' },
  { value: 'military_id', label: 'Military ID' },
  { value: 'permanent_resident_card', label: 'Green card' },
  { value: 'visa', label: 'Visa' },
  { value: 'naturalization_certificate', label: 'Naturalization certificate' },
  { value: 'marriage_certificate', label: 'Marriage certificate' },
  { value: 'concealed_carry', label: 'Concealed carry permit' },
  { value: 'other', label: 'Other' },
];

const identificationsDefinition: RecordDefinition = {
  table: 'member_identifications',
  slug: 'identifications',
  singular: 'Document',
  plural: 'Documents',
  emptyMessage: 'No ID documents recorded yet.',
  titleField: 'label',
  parentColumn: 'member_id',

  fields: [
    {
      name: 'identification_type',
      label: 'What kind?',
      kind: 'select',
      group: 'core',
      options: IDENTIFICATION_TYPES,
    },
    { name: 'label', label: 'Label', kind: 'text', group: 'core', placeholder: 'Passport' },
    {
      name: 'document_number',
      label: 'Number',
      kind: 'text',
      secret: true,
      hintColumn: 'document_number_hint',
      group: 'core',
    },
    {
      name: 'expires_on',
      label: 'Expires on',
      kind: 'date',
      group: 'core',
      help: 'The reason this section exists. We will warn you before it lapses.',
    },

    { name: 'issuing_authority', label: 'Issued by', kind: 'text', group: 'more' },
    { name: 'issued_on', label: 'Issued on', kind: 'date', group: 'more' },
    { name: 'license_class', label: 'Class', kind: 'text', group: 'more' },
    { name: 'is_real_id', label: 'REAL ID compliant', kind: 'boolean', group: 'more' },
    {
      name: 'physical_location',
      label: 'Where is the original?',
      kind: 'text',
      group: 'more',
      help: 'Often the only thing anyone actually needs to know.',
    },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
  ],

  createDefaults: { identification_type: 'other' },
};

export const householdMembersDefinition: RecordDefinition = {
  table: 'household_members',
  slug: 'people',
  singular: 'Person',
  plural: 'People',
  emptyMessage:
    'Everyone in your household, with the documents and dates that are impossible to find in a hurry.',
  titleField: 'display_name',
  subtitleField: 'relationship',

  fields: [
    {
      name: 'display_name',
      label: 'Name',
      kind: 'text',
      group: 'core',
      required: true,
      placeholder: 'Mom',
      help: 'Whatever you actually call them.',
    },
    { name: 'relationship', label: 'Relationship', kind: 'text', group: 'core', placeholder: 'Mother' },
    { name: 'date_of_birth', label: 'Date of birth', kind: 'date', group: 'core' },
    { name: 'phone', label: 'Phone', kind: 'phone', group: 'core' },
    {
      name: 'ssn',
      label: 'Social Security number',
      kind: 'text',
      secret: true,
      group: 'core',
      help: 'Encrypted on this device. We store scrambled text we cannot read.',
    },

    { name: 'legal_name', label: 'Full legal name', kind: 'text', group: 'more' },
    { name: 'preferred_name', label: 'Goes by', kind: 'text', group: 'more' },
    { name: 'email', label: 'Email', kind: 'email', group: 'more' },
    { name: 'place_of_birth', label: 'Place of birth', kind: 'text', group: 'more' },
    { name: 'citizenship', label: 'Citizenship', kind: 'text', group: 'more' },

    // Kept with the person rather than under Health: these are what someone
    // reads off a phone screen in an ambulance.
    { name: 'blood_type', label: 'Blood type', kind: 'text', group: 'more' },
    { name: 'height', label: 'Height', kind: 'text', group: 'more' },
    { name: 'weight', label: 'Weight', kind: 'text', group: 'more' },
    { name: 'eye_color', label: 'Eye colour', kind: 'text', group: 'more' },

    { name: 'employer', label: 'Employer', kind: 'text', group: 'more' },
    { name: 'work_phone', label: 'Work phone', kind: 'phone', group: 'more' },
    {
      name: 'ssn_card_location',
      label: 'Where is the Social Security card?',
      kind: 'text',
      group: 'more',
    },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],

  children: [
    {
      definition: identificationsDefinition,
      title: 'ID documents',
      emptyMessage:
        'Passports, licences, birth certificates. Recording the expiry date is what lets us warn you in time.',
      addLabel: 'Add a document',
      summarize: (values) => {
        const kind = IDENTIFICATION_TYPES.find(
          (option) => option.value === text(values, 'identification_type'),
        )?.label;
        return summary([
          text(values, 'label') || kind,
          text(values, 'expires_on') && `expires ${text(values, 'expires_on')}`,
        ]);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

const serviceRecordsDefinition: RecordDefinition = {
  table: 'vehicle_service_records',
  slug: 'service',
  singular: 'Service',
  plural: 'Service history',
  emptyMessage: 'Nothing logged yet.',
  titleField: 'service_type',
  parentColumn: 'vehicle_id',
  // Nothing here is worth sealing, and the table has no wrapped_cek column.
  contentKey: false,

  // serviced_on is NOT NULL and a date, so an empty string will not do:
  // a log entry defaults to today, which is when it is being written.
  createDefaults: { serviced_on: () => new Date().toISOString().slice(0, 10) },

  fields: [
    { name: 'serviced_on', label: 'Date', kind: 'date', group: 'core', required: true },
    {
      name: 'service_type',
      label: 'What was done?',
      kind: 'text',
      group: 'core',
      placeholder: 'Oil change',
    },
    { name: 'odometer', label: 'Odometer', kind: 'number', group: 'core' },
    { name: 'vendor_name', label: 'Who did it?', kind: 'text', group: 'core' },

    { name: 'cost_cents', label: 'Cost', kind: 'money', group: 'more' },
    { name: 'description', label: 'Details', kind: 'textarea', group: 'more' },
    { name: 'warranty_expires_on', label: 'Warranty until', kind: 'date', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
  ],
};

export const vehiclesDefinition: RecordDefinition = {
  table: 'vehicles',
  slug: 'vehicles',
  singular: 'Vehicle',
  plural: 'Vehicles',
  emptyMessage:
    'Every car, with the registration dates, the VIN, and the tyre size you need at the parts counter.',
  titleField: 'nickname',
  subtitleField: 'license_plate',

  fields: [
    {
      name: 'nickname',
      label: 'What do you call it?',
      kind: 'text',
      group: 'core',
      required: true,
      placeholder: "Mom's Honda",
    },
    { name: 'make', label: 'Make', kind: 'text', group: 'core', placeholder: 'Honda' },
    { name: 'model', label: 'Model', kind: 'text', group: 'core', placeholder: 'Accord' },
    { name: 'year', label: 'Year', kind: 'number', group: 'core' },
    { name: 'license_plate', label: 'Licence plate', kind: 'text', group: 'core' },
    {
      name: 'registration_expires_on',
      label: 'Registration expires',
      kind: 'date',
      group: 'core',
      help: 'We will remind you before it lapses.',
    },

    { name: 'plate_state', label: 'Plate state', kind: 'text', group: 'more' },
    { name: 'trim', label: 'Trim', kind: 'text', group: 'more' },
    { name: 'color', label: 'Colour', kind: 'text', group: 'more' },
    { name: 'vin', label: 'VIN', kind: 'text', secret: true, hintColumn: 'vin_hint', group: 'more' },
    { name: 'registration_starts_on', label: 'Registered from', kind: 'date', group: 'more' },
    { name: 'inspection_due_on', label: 'Inspection due', kind: 'date', group: 'more' },
    { name: 'title_number', label: 'Title number', kind: 'text', secret: true, group: 'more' },
    { name: 'title_location', label: 'Where is the title?', kind: 'text', group: 'more' },

    { name: 'odometer', label: 'Odometer', kind: 'number', group: 'more' },
    { name: 'odometer_as_of', label: 'Odometer read on', kind: 'date', group: 'more' },
    { name: 'next_service_on', label: 'Next service due', kind: 'date', group: 'more' },

    // The parts-counter fields. Individually trivial, collectively one of the
    // most-opened screens in an app like this.
    { name: 'tire_size', label: 'Tyre size', kind: 'text', group: 'more' },
    { name: 'oil_type', label: 'Oil type', kind: 'text', group: 'more' },
    { name: 'battery_group', label: 'Battery group size', kind: 'text', group: 'more' },
    { name: 'wiper_size', label: 'Wiper blade size', kind: 'text', group: 'more' },

    { name: 'key_fob_count', label: 'How many key fobs?', kind: 'number', group: 'more' },
    { name: 'key_code', label: 'Key code', kind: 'text', secret: true, group: 'more' },
    { name: 'spare_key_location', label: 'Where is the spare key?', kind: 'text', group: 'more' },
    {
      name: 'toll_transponder_account',
      label: 'Toll transponder account',
      kind: 'text',
      secret: true,
      group: 'more',
    },

    { name: 'purchased_on', label: 'Bought on', kind: 'date', group: 'more' },
    { name: 'purchase_price_cents', label: 'Purchase price', kind: 'money', group: 'more' },
    { name: 'lease_ends_on', label: 'Lease ends', kind: 'date', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],

  children: [
    {
      definition: serviceRecordsDefinition,
      title: 'Service history',
      emptyMessage:
        'A log rather than a single "last serviced" date, because the history is what matters when selling the car or arguing about a warranty.',
      addLabel: 'Log a service',
      summarize: (values) =>
        summary([
          text(values, 'serviced_on'),
          text(values, 'service_type'),
          text(values, 'vendor_name'),
        ]),
    },
  ],
};

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const UTILITY_KINDS = [
  { value: 'electric', label: 'Electric' },
  { value: 'gas', label: 'Gas' },
  { value: 'water', label: 'Water' },
  { value: 'sewer', label: 'Sewer' },
  { value: 'septic', label: 'Septic' },
  { value: 'garbage', label: 'Garbage' },
  { value: 'recycling', label: 'Recycling' },
  { value: 'propane', label: 'Propane' },
  { value: 'well', label: 'Well' },
  { value: 'solar', label: 'Solar' },
  { value: 'internet', label: 'Internet' },
  { value: 'other', label: 'Other' },
];

const utilitiesDefinition: RecordDefinition = {
  table: 'property_utilities',
  slug: 'utilities',
  singular: 'Utility',
  plural: 'Utilities',
  emptyMessage: 'No utilities recorded yet.',
  titleField: 'vendor_name',
  parentColumn: 'property_id',

  fields: [
    { name: 'utility_kind', label: 'What kind?', kind: 'select', group: 'core', options: UTILITY_KINDS },
    { name: 'vendor_name', label: 'Company', kind: 'text', group: 'core' },
    {
      name: 'account_number',
      label: 'Account number',
      kind: 'text',
      secret: true,
      hintColumn: 'account_number_hint',
      group: 'core',
    },
    {
      name: 'shutoff_location',
      label: 'Where is the shutoff?',
      kind: 'text',
      group: 'core',
      help: 'The question people actually ask during an emergency.',
    },

    { name: 'meter_number', label: 'Meter number', kind: 'text', group: 'more' },
    { name: 'portal_url', label: 'Login page', kind: 'url', group: 'more' },
    { name: 'autopay', label: 'On autopay', kind: 'boolean', group: 'more' },
    { name: 'average_monthly_cents', label: 'Typical monthly bill', kind: 'money', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
  ],

  createDefaults: { utility_kind: 'other' },
};

const appliancesDefinition: RecordDefinition = {
  table: 'appliances',
  slug: 'appliances',
  singular: 'Appliance',
  plural: 'Appliances',
  emptyMessage: 'Nothing recorded yet.',
  titleField: 'name',
  parentColumn: 'property_id',

  fields: [
    {
      name: 'name',
      label: 'What is it?',
      kind: 'text',
      group: 'core',
      required: true,
      placeholder: 'Furnace',
    },
    { name: 'brand', label: 'Brand', kind: 'text', group: 'core' },
    { name: 'model_number', label: 'Model number', kind: 'text', group: 'core' },
    {
      name: 'filter_size',
      label: 'Filter size',
      kind: 'text',
      group: 'core',
      help: 'The thing you want on your phone standing in the hardware aisle.',
    },
    { name: 'warranty_expires_on', label: 'Warranty until', kind: 'date', group: 'core' },

    { name: 'category', label: 'Category', kind: 'text', group: 'more' },
    { name: 'location', label: 'Where is it?', kind: 'text', group: 'more' },
    { name: 'serial_number', label: 'Serial number', kind: 'text', group: 'more' },
    { name: 'purchased_on', label: 'Bought on', kind: 'date', group: 'more' },
    { name: 'installed_on', label: 'Installed on', kind: 'date', group: 'more' },
    { name: 'filter_interval_months', label: 'Change filter every (months)', kind: 'number', group: 'more' },
    { name: 'filter_last_changed_on', label: 'Filter last changed', kind: 'date', group: 'more' },
    { name: 'manual_url', label: 'Manual', kind: 'url', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
  ],
};

const finishesDefinition: RecordDefinition = {
  table: 'property_finishes',
  slug: 'finishes',
  singular: 'Finish',
  plural: 'Paint and finishes',
  emptyMessage: 'Nothing recorded yet.',
  titleField: 'color_name',
  parentColumn: 'property_id',
  // Paint colours are not secrets, and the table carries no content key.
  contentKey: false,

  fields: [
    { name: 'room', label: 'Room', kind: 'text', group: 'core', placeholder: 'Back bedroom' },
    {
      name: 'finish_type',
      label: 'What is it?',
      kind: 'combo',
      group: 'core',
      options: ['Paint', 'Flooring', 'Tile', 'Countertop', 'Cabinet hardware', 'Grout'].map(
        (value) => ({ value, label: value }),
      ),
    },
    { name: 'brand', label: 'Brand', kind: 'text', group: 'core' },
    { name: 'color_name', label: 'Colour name', kind: 'text', group: 'core' },
    { name: 'color_code', label: 'Colour code', kind: 'text', group: 'core' },

    { name: 'sheen', label: 'Sheen', kind: 'text', group: 'more' },
    { name: 'product_details', label: 'Product details', kind: 'textarea', group: 'more' },
    { name: 'applied_on', label: 'Applied on', kind: 'date', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
  ],

  createDefaults: { finish_type: 'Paint' },
};

export const propertiesDefinition: RecordDefinition = {
  table: 'properties',
  slug: 'homes',
  singular: 'Home',
  plural: 'Homes',
  emptyMessage:
    'Your home, with the shutoff locations, appliance warranties, and paint colours nobody writes down.',
  titleField: 'nickname',
  subtitleField: 'street_address',

  fields: [
    {
      name: 'nickname',
      label: 'What do you call it?',
      kind: 'text',
      group: 'core',
      required: true,
      placeholder: 'Home',
    },
    { name: 'street_address', label: 'Street address', kind: 'text', group: 'core' },
    { name: 'city', label: 'City', kind: 'text', group: 'core' },
    { name: 'state', label: 'State', kind: 'text', group: 'core' },
    { name: 'postal_code', label: 'ZIP', kind: 'text', group: 'core' },

    // The questions asked during an actual emergency.
    { name: 'water_shutoff_location', label: 'Water shutoff', kind: 'text', group: 'core' },
    { name: 'gas_shutoff_location', label: 'Gas shutoff', kind: 'text', group: 'core' },
    { name: 'breaker_panel_location', label: 'Breaker panel', kind: 'text', group: 'core' },

    {
      name: 'property_kind',
      label: 'What is it?',
      kind: 'select',
      group: 'more',
      options: [
        { value: 'primary_residence', label: 'Where we live' },
        { value: 'second_home', label: 'Second home' },
        { value: 'rental_owned', label: 'Rental we own' },
        { value: 'rented', label: 'We rent it' },
        { value: 'land', label: 'Land' },
        { value: 'other', label: 'Other' },
      ],
    },
    { name: 'built_on', label: 'Built', kind: 'date', group: 'more' },
    { name: 'purchased_on', label: 'Bought on', kind: 'date', group: 'more' },
    { name: 'purchase_price_cents', label: 'Purchase price', kind: 'money', group: 'more' },
    { name: 'square_feet', label: 'Square feet', kind: 'number', group: 'more' },
    { name: 'bedrooms', label: 'Bedrooms', kind: 'text', group: 'more' },
    { name: 'bathrooms', label: 'Bathrooms', kind: 'text', group: 'more' },
    { name: 'zillow_url', label: 'Zillow link', kind: 'url', group: 'more' },
    {
      name: 'parcel_number',
      label: 'Parcel number',
      kind: 'text',
      group: 'more',
      help: 'Needed if you ever appeal your property taxes.',
    },
    { name: 'deed_location', label: 'Where is the deed?', kind: 'text', group: 'more' },

    { name: 'garage_opener_make', label: 'Garage opener make', kind: 'text', group: 'more' },
    { name: 'garage_opener_model', label: 'Garage opener model', kind: 'text', group: 'more' },
    { name: 'garage_code', label: 'Garage code', kind: 'text', secret: true, group: 'more' },
    { name: 'alarm_code', label: 'Alarm code', kind: 'text', secret: true, group: 'more' },
    {
      name: 'duress_code',
      label: 'Duress code',
      kind: 'text',
      secret: true,
      group: 'more',
      help: 'The one that silently calls for help.',
    },
    { name: 'alarm_permit_number', label: 'Alarm permit number', kind: 'text', group: 'more' },

    { name: 'trash_pickup_day', label: 'Trash day', kind: 'text', group: 'more' },
    { name: 'recycling_pickup_day', label: 'Recycling day', kind: 'text', group: 'more' },

    { name: 'lease_starts_on', label: 'Lease starts', kind: 'date', group: 'more' },
    { name: 'lease_ends_on', label: 'Lease ends', kind: 'date', group: 'more' },
    { name: 'rent_cents', label: 'Rent', kind: 'money', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],

  createDefaults: { property_kind: 'primary_residence' },

  children: [
    {
      definition: utilitiesDefinition,
      title: 'Utilities',
      emptyMessage: 'Electric, gas, water, trash — and where each one shuts off.',
      addLabel: 'Add a utility',
      summarize: (values) => {
        const kind = UTILITY_KINDS.find(
          (option) => option.value === text(values, 'utility_kind'),
        )?.label;
        return summary([kind, text(values, 'vendor_name')]);
      },
    },
    {
      definition: appliancesDefinition,
      title: 'Appliances and systems',
      emptyMessage:
        'Furnace, water heater, fridge. Filter sizes and warranty dates are the reason this is worth filling in.',
      addLabel: 'Add an appliance',
      summarize: (values) =>
        summary([
          text(values, 'name'),
          text(values, 'brand'),
          text(values, 'filter_size') && `filter ${text(values, 'filter_size')}`,
        ]),
    },
    {
      definition: finishesDefinition,
      title: 'Paint and finishes',
      emptyMessage: 'The colour of the back bedroom, three years from now.',
      addLabel: 'Add a colour or finish',
      summarize: (values) =>
        summary([
          text(values, 'room'),
          text(values, 'color_name'),
          text(values, 'color_code'),
          text(values, 'brand'),
        ]),
    },
  ],
};

/** Child definitions, exported so the schema-drift test can reach them. */
export const CHILD_DEFINITIONS = [
  identificationsDefinition,
  serviceRecordsDefinition,
  utilitiesDefinition,
  appliancesDefinition,
  finishesDefinition,
];
