// @vitest-environment jsdom

/**
 * Drives the real record screens against an in-memory gateway and real crypto.
 *
 * The encryption is not faked here. These tests mount the actual list and
 * detail screens, type into them, and then look at what the "database" ended up
 * holding — which is the only way to be sure a form cannot write a secret in
 * the clear.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useEffect, useRef } from 'react';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VaultProvider, useVault } from '@/lib/vault/vault-provider';
import { MemoryKeyStore } from '@/lib/vault/memory-key-store';
import type { CryptoEngine } from '@/lib/crypto/engine';
import { generateDek } from '@/lib/crypto/keys';
import type { SealedEnvelope } from '@/lib/crypto/envelope';

import { MemoryRecordGateway } from './memory-gateway';
import { setRecordGatewayFactory } from './use-records';
import { contactsDefinition } from './definitions';

import { RecordListScreen } from '@/app/(app)/[slug]/record-list-screen';
import { RecordDetailScreen } from '@/app/(app)/[slug]/[id]/record-detail-screen';

const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('not found');
  },
}));

const ENVELOPE = { v: 1, alg: 'A256GCM', iv: 'aa', ct: 'bb' } as SealedEnvelope;
const WAIT = { timeout: 5000 };

let gateway: MemoryRecordGateway;
let dek: CryptoKey;
let familyId: string;

/** Hands the provider a real data key without paying for Argon2id. */
function engineFor(key: CryptoKey): CryptoEngine {
  const wrappings = [
    {
      via: 'passphrase' as const,
      wrappedDek: ENVELOPE,
      kdfParams: { alg: 'argon2id' as const, m: 1, t: 1, p: 1 },
      salt: 'c2FsdA',
    },
  ];

  return {
    async setUpVault() {
      return {
        dek: key,
        recoveryCode: 'FGK1-AAAAA',
        wrappings,
        identity: { publicKey: 'pk', wrappedPrivateKey: ENVELOPE },
      };
    },
    async unlock() {
      return key;
    },
    async recoverAndRewrap() {
      throw new Error('not used here');
    },
    async changePassphrase() {
      throw new Error('not used here');
    },
  };
}

/** Unlocks as soon as the provider has worked out that there is a vault. */
function UnlockOnMount({ children }: { children: React.ReactNode }) {
  const { unlock, status, loadingStatus, state } = useVault();
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current || loadingStatus) return;
    if (status?.state !== 'locked' || state.status !== 'locked') return;
    tried.current = true;
    void unlock('anything');
  }, [loadingStatus, state.status, status, unlock]);

  return <>{children}</>;
}

/** Mounts a screen with the vault open, replacing whatever was mounted before. */
async function mount(node: React.ReactNode) {
  cleanup();

  const store = new MemoryKeyStore();
  const family = await store.createFamily('Whitfield');
  familyId = family.id;

  const engine = engineFor(dek);
  await store.saveWrappings(family.id, (await engine.setUpVault('x')).wrappings);

  render(
    <VaultProvider engine={engine} store={store}>
      <UnlockOnMount>{node}</UnlockOnMount>
    </VaultProvider>,
  );
}

beforeEach(async () => {
  push.mockClear();
  replace.mockClear();
  gateway = new MemoryRecordGateway();
  dek = (await generateDek()).key;
  setRecordGatewayFactory(() => gateway);

  // jsdom exposes navigator.clipboard as a getter, so it has to be redefined
  // rather than assigned.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => {}) },
  });
});

/** Creates an empty contact the way the list screen does, and returns its id. */
async function createContact() {
  await mount(<RecordListScreen slug="contacts" />);
  const user = userEvent.setup();

  await user.click(await screen.findByRole('button', { name: /add your first contact/i }, WAIT));
  await waitFor(() => expect(push).toHaveBeenCalled());

  return String(push.mock.calls[0][0]).split('/').pop()!;
}

/**
 * The input, not the "Copy Account number" button beside it — a loose match
 * finds both.
 */
function accountInput() {
  return screen.getByLabelText(/^account number/i);
}

function rowFor(id: string) {
  return gateway.rawRows('contacts').find((row) => row.id === id);
}

describe('the record list', () => {
  it('explains what the section is for before anything exists', async () => {
    await mount(<RecordListScreen slug="contacts" />);
    expect(await screen.findByText(contactsDefinition.emptyMessage, {}, WAIT)).toBeInTheDocument();
  });

  it('creates a record and opens it straight away', async () => {
    const id = await createContact();

    expect(push).toHaveBeenCalledWith(`/contacts/${id}`);
    // The row exists the moment the button is pressed, so nothing typed
    // afterwards can be lost to a half-finished create flow.
    expect(gateway.rawRows('contacts')).toHaveLength(1);
  });

  it('lists and filters what is there', async () => {
    const user = userEvent.setup();
    await mount(<RecordListScreen slug="contacts" />);
    await screen.findByText(contactsDefinition.emptyMessage, {}, WAIT);

    for (const name of ['Riverside Plumbing', 'Oak Street Dental']) {
      await gateway.insert('contacts', {
        id: crypto.randomUUID(),
        family_id: familyId,
        name,
        category: 'Vendor',
        wrapped_cek: ENVELOPE,
      });
    }

    await mount(<RecordListScreen slug="contacts" />);
    const search = await screen.findByLabelText(/search contacts/i, {}, WAIT);

    expect(screen.getByText('Oak Street Dental')).toBeInTheDocument();

    await user.type(search, 'plumb');
    await waitFor(() => expect(screen.queryByText('Oak Street Dental')).not.toBeInTheDocument());
    expect(screen.getByText('Riverside Plumbing')).toBeInTheDocument();
  });
});

describe('the record form', () => {
  it('saves what is typed, with no save button anywhere', async () => {
    const id = await createContact();
    const user = userEvent.setup();

    await mount(<RecordDetailScreen slug="contacts" id={id} />);
    await user.type(await screen.findByLabelText('Name', {}, WAIT), 'Riverside Plumbing');
    await user.tab();

    await waitFor(() => expect(rowFor(id)?.name).toBe('Riverside Plumbing'));
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });

  it('says when it has saved', async () => {
    const id = await createContact();
    const user = userEvent.setup();

    await mount(<RecordDetailScreen slug="contacts" id={id} />);
    await user.type(await screen.findByLabelText('Name', {}, WAIT), 'Riverside');
    await user.tab();

    expect(await screen.findByText('Saved', {}, WAIT)).toBeInTheDocument();
  });

  it('keeps the long tail of fields out of the way until asked', async () => {
    const id = await createContact();
    const user = userEvent.setup();

    await mount(<RecordDetailScreen slug="contacts" id={id} />);
    await screen.findByLabelText('Name', {}, WAIT);

    // A form that opens with forty inputs is a form nobody finishes.
    expect(screen.queryByLabelText(/^account number/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add more details/i }));
    expect(accountInput()).toBeInTheDocument();
  });

  it('encrypts a secret field and leaves the rest readable', async () => {
    const id = await createContact();
    const user = userEvent.setup();

    await mount(<RecordDetailScreen slug="contacts" id={id} />);
    await user.type(await screen.findByLabelText('Name', {}, WAIT), 'Riverside Plumbing');
    await user.click(screen.getByRole('button', { name: /add more details/i }));
    await user.type(accountInput(), '000123456789');
    await user.tab();

    await waitFor(() => expect(rowFor(id)?.account_number_hint).toBe('••••6789'));

    // The claim the whole product rests on, asserted through the real form.
    expect(gateway.everythingStored()).not.toContain('000123456789');
    expect(gateway.everythingStored()).toContain('Riverside Plumbing');
  });

  it('masks a secret while typing, and reveals it on request', async () => {
    const id = await createContact();
    const user = userEvent.setup();

    await mount(<RecordDetailScreen slug="contacts" id={id} />);
    await screen.findByLabelText('Name', {}, WAIT);
    await user.click(screen.getByRole('button', { name: /add more details/i }));

    const account = accountInput();
    expect(account).toHaveAttribute('type', 'password');

    await user.click(within(account.closest('div')!).getByRole('button', { name: 'Show' }));
    expect(account).toHaveAttribute('type', 'text');
  });

  it('shows a decrypted value again on a cold open', async () => {
    const id = await createContact();
    const user = userEvent.setup();

    await mount(<RecordDetailScreen slug="contacts" id={id} />);
    await screen.findByLabelText('Name', {}, WAIT);
    await user.click(screen.getByRole('button', { name: /add more details/i }));
    await user.type(accountInput(), '000123456789');
    await user.tab();

    await waitFor(() => expect(rowFor(id)?.account_number).toBeTruthy());

    // Reopening the record has to unwrap the content key and decrypt again.
    await mount(<RecordDetailScreen slug="contacts" id={id} />);
    await screen.findByLabelText('Name', {}, WAIT);
    await user.click(screen.getByRole('button', { name: /add more details/i }));

    const account = accountInput() as HTMLInputElement;
    expect(account.value).toBe('000123456789');
  });

  it('offers to copy a secret without revealing it', async () => {
    const id = await createContact();
    const user = userEvent.setup();

    // userEvent.setup() installs its own clipboard stub, so ours has to go in
    // afterwards to be the one the button actually calls.
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await mount(<RecordDetailScreen slug="contacts" id={id} />);
    await screen.findByLabelText('Name', {}, WAIT);
    await user.click(screen.getByRole('button', { name: /add more details/i }));
    await user.type(accountInput(), '000123456789');

    const field = accountInput().closest('div')!;
    await user.click(within(field).getByRole('button', { name: /copy account number/i }));

    expect(writeText).toHaveBeenCalledWith('000123456789');
  });

  it('deletes only after asking', async () => {
    const id = await createContact();
    const user = userEvent.setup();

    await mount(<RecordDetailScreen slug="contacts" id={id} />);
    await screen.findByLabelText('Name', {}, WAIT);

    await user.click(screen.getByRole('button', { name: /delete this contact/i }));
    expect(gateway.rawRows('contacts')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /yes, delete it/i }));
    await waitFor(() => expect(gateway.rawRows('contacts')).toHaveLength(0));
    expect(replace).toHaveBeenCalledWith('/contacts');
  });

  it('backs out of a delete cleanly', async () => {
    const id = await createContact();
    const user = userEvent.setup();

    await mount(<RecordDetailScreen slug="contacts" id={id} />);
    await screen.findByLabelText('Name', {}, WAIT);

    await user.click(screen.getByRole('button', { name: /delete this contact/i }));
    await user.click(screen.getByRole('button', { name: /keep it/i }));

    expect(gateway.rawRows('contacts')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /delete this contact/i })).toBeInTheDocument();
  });

  it('says so plainly when a record has gone', async () => {
    await mount(<RecordDetailScreen slug="contacts" id={crypto.randomUUID()} />);
    expect(await screen.findByText(/has been deleted/i, {}, WAIT)).toBeInTheDocument();
  });
});
