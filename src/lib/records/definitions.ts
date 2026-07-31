/**
 * The three record types that absorb most of the app.
 *
 * These are the generic tables from the schema: every vendor is a contact,
 * every insurance policy is a policy, every bank account is a financial
 * account. Because a definition drives the list, the form, the encryption, and
 * the database mapping, adding a category from here on is a matter of writing
 * one of these rather than building another screen.
 */

import type { RecordDefinition } from './definition';
import {
  householdMembersDefinition,
  propertiesDefinition,
  vehiclesDefinition,
} from './core-definitions';

/** Categories offered as suggestions. Free text underneath, always. */
const CONTACT_CATEGORIES = [
  'Doctor',
  'Dentist',
  'Vet',
  'Plumber',
  'Electrician',
  'HVAC',
  'Landscaper',
  'General contractor',
  'Painter',
  'Insurance agent',
  'Bank',
  'School',
  'Utility',
  'Pharmacy',
  'Other',
];

export const contactsDefinition: RecordDefinition = {
  table: 'contacts',
  slug: 'contacts',
  singular: 'Contact',
  plural: 'Contacts',
  emptyMessage:
    'Everyone your family relies on — the plumber, the pediatrician, the insurance agent — in one place you can search.',
  titleField: 'name',
  subtitleField: 'category',

  fields: [
    {
      name: 'name',
      label: 'Name',
      kind: 'text',
      group: 'core',
      required: true,
      placeholder: 'Riverside Plumbing',
    },
    {
      name: 'category',
      label: 'What are they?',
      kind: 'combo',
      group: 'core',
      options: CONTACT_CATEGORIES.map((value) => ({ value, label: value })),
      help: 'Pick one or type your own.',
    },
    { name: 'phone', label: 'Phone', kind: 'phone', group: 'core' },
    {
      name: 'after_hours_phone',
      label: 'After-hours or emergency phone',
      kind: 'phone',
      group: 'core',
      help: 'The number that matters at 2am. Often different from the main line.',
    },

    { name: 'contact_person', label: 'Who you deal with', kind: 'text', group: 'more' },
    { name: 'email', label: 'Email', kind: 'email', group: 'more' },
    { name: 'address', label: 'Address', kind: 'textarea', group: 'more' },
    { name: 'website', label: 'Website', kind: 'url', group: 'more' },
    { name: 'portal_url', label: 'Login page', kind: 'url', group: 'more' },
    {
      name: 'account_number',
      label: 'Account number',
      kind: 'text',
      secret: true,
      hintColumn: 'account_number_hint',
      group: 'more',
    },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    {
      name: 'last_verified_at',
      label: 'Last checked',
      kind: 'date',
      group: 'more',
      help: 'When you last confirmed this is still right.',
    },
  ],
};

const POLICY_TYPES = [
  { value: 'health', label: 'Health' },
  { value: 'dental', label: 'Dental' },
  { value: 'vision', label: 'Vision' },
  { value: 'life', label: 'Life' },
  { value: 'disability', label: 'Disability' },
  { value: 'long_term_care', label: 'Long-term care' },
  { value: 'auto', label: 'Auto' },
  { value: 'homeowners', label: 'Homeowners' },
  { value: 'renters', label: 'Renters' },
  { value: 'flood', label: 'Flood' },
  { value: 'umbrella', label: 'Umbrella' },
  { value: 'home_warranty', label: 'Home warranty' },
  { value: 'pet', label: 'Pet' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
];

export const policiesDefinition: RecordDefinition = {
  table: 'policies',
  slug: 'policies',
  singular: 'Policy',
  plural: 'Insurance',
  emptyMessage:
    'Every policy you hold, with the numbers and renewal dates you can never find when you need them.',
  titleField: 'label',
  subtitleField: 'carrier_name',

  fields: [
    {
      name: 'label',
      label: 'What is it?',
      kind: 'text',
      group: 'core',
      placeholder: "Dana's health plan",
    },
    {
      name: 'policy_type',
      label: 'Kind of insurance',
      kind: 'select',
      group: 'core',
      options: POLICY_TYPES,
    },
    { name: 'carrier_name', label: 'Company', kind: 'text', group: 'core' },
    {
      name: 'policy_number',
      label: 'Policy number',
      kind: 'text',
      secret: true,
      hintColumn: 'policy_number_hint',
      group: 'core',
    },
    {
      name: 'renews_on',
      label: 'Renews on',
      kind: 'date',
      group: 'core',
      help: 'We will remind you before this comes around.',
    },
    { name: 'phone', label: 'Phone', kind: 'phone', group: 'core' },

    {
      name: 'claims_phone',
      label: 'Claims phone',
      kind: 'phone',
      group: 'more',
      help: 'Usually different from the sales line, and the one you need in a hurry.',
    },
    {
      name: 'member_id',
      label: 'Member ID',
      kind: 'text',
      secret: true,
      group: 'more',
      help: 'The number on the card, which is often not the policy number.',
    },
    { name: 'group_number', label: 'Group number', kind: 'text', secret: true, group: 'more' },
    { name: 'effective_on', label: 'Started on', kind: 'date', group: 'more' },
    { name: 'expires_on', label: 'Ends on', kind: 'date', group: 'more' },
    { name: 'premium_cents', label: 'Premium', kind: 'money', group: 'more' },
    { name: 'deductible_cents', label: 'Deductible', kind: 'money', group: 'more' },
    { name: 'coverage_amount_cents', label: 'Coverage amount', kind: 'money', group: 'more' },
    {
      name: 'beneficiaries',
      label: 'Beneficiaries',
      kind: 'textarea',
      group: 'more',
      help: 'Worth checking every few years — these override a will.',
    },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],

  // policy_type is NOT NULL in the schema, and nothing but a name should ever
  // be required of the user.
  createDefaults: { policy_type: 'other' },
};

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'traditional_ira', label: 'Traditional IRA' },
  { value: 'roth_ira', label: 'Roth IRA' },
  { value: 'retirement_401k', label: '401(k)' },
  { value: 'hsa', label: 'HSA' },
  { value: 'fsa', label: 'FSA' },
  { value: 'college_529', label: '529 college savings' },
  { value: 'pension', label: 'Pension' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'loan_mortgage', label: 'Mortgage' },
  { value: 'loan_auto', label: 'Car loan' },
  { value: 'loan_student', label: 'Student loan' },
  { value: 'loan_personal', label: 'Personal loan' },
  { value: 'heloc', label: 'HELOC' },
  { value: 'safe_deposit_box', label: 'Safe deposit box' },
  { value: 'other', label: 'Other' },
];

export const accountsDefinition: RecordDefinition = {
  table: 'financial_accounts',
  slug: 'accounts',
  singular: 'Account',
  plural: 'Money',
  emptyMessage:
    'Bank accounts, cards, loans, and retirement savings — with the numbers you need on the phone with support.',
  titleField: 'nickname',
  subtitleField: 'institution_name',

  fields: [
    {
      name: 'nickname',
      label: 'What do you call it?',
      kind: 'text',
      group: 'core',
      required: true,
      placeholder: 'Joint checking',
    },
    {
      name: 'account_type',
      label: 'Kind of account',
      kind: 'select',
      group: 'core',
      options: ACCOUNT_TYPES,
    },
    { name: 'institution_name', label: 'Bank or company', kind: 'text', group: 'core' },
    {
      name: 'account_number',
      label: 'Account number',
      kind: 'text',
      secret: true,
      hintColumn: 'account_number_last4',
      group: 'core',
    },
    { name: 'phone', label: 'Support phone', kind: 'phone', group: 'core' },

    { name: 'routing_number', label: 'Routing number', kind: 'text', secret: true, group: 'more' },
    { name: 'online_url', label: 'Login page', kind: 'url', group: 'more' },
    {
      name: 'international_phone',
      label: 'International collect number',
      kind: 'phone',
      group: 'more',
      help: 'Printed on the back of a card, and useless once the card is lost.',
    },
    { name: 'owners', label: 'Whose account is it?', kind: 'text', group: 'more' },
    {
      name: 'beneficiaries',
      label: 'Beneficiaries',
      kind: 'textarea',
      group: 'more',
      help: 'These override a will, and almost nobody keeps track of them.',
    },
    { name: 'opened_on', label: 'Opened on', kind: 'date', group: 'more' },
    { name: 'card_expires_on', label: 'Card expires', kind: 'date', group: 'more' },
    { name: 'credit_limit_cents', label: 'Credit limit', kind: 'money', group: 'more' },
    { name: 'payment_due_day', label: 'Payment due on the', kind: 'number', group: 'more' },
    { name: 'interest_rate', label: 'Interest rate (%)', kind: 'text', group: 'more' },
    { name: 'balance_cents', label: 'Balance', kind: 'money', group: 'more' },
    { name: 'balance_as_of', label: 'Balance as of', kind: 'date', group: 'more' },
    { name: 'monthly_payment_cents', label: 'Monthly payment', kind: 'money', group: 'more' },
    { name: 'payoff_on', label: 'Paid off on', kind: 'date', group: 'more' },
    { name: 'notes', label: 'Notes', kind: 'textarea', group: 'more' },
    { name: 'last_verified_at', label: 'Last checked', kind: 'date', group: 'more' },
  ],

  createDefaults: { account_type: 'other' },
};

/**
 * Order matters: this is the order the sections appear on the vault home
 * screen, so it runs from the things a family reaches for most often.
 */
export const ALL_DEFINITIONS = [
  householdMembersDefinition,
  propertiesDefinition,
  vehiclesDefinition,
  contactsDefinition,
  policiesDefinition,
  accountsDefinition,
];

export {
  householdMembersDefinition,
  propertiesDefinition,
  vehiclesDefinition,
} from './core-definitions';

export function definitionBySlug(slug: string): RecordDefinition | undefined {
  return ALL_DEFINITIONS.find((definition) => definition.slug === slug);
}
