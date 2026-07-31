// @vitest-environment jsdom

/**
 * Drives the real screens against fake stores.
 *
 * The crypto itself is covered exhaustively elsewhere with real Argon2id; what
 * is worth testing here is the wiring — that setup persists before showing the
 * kit, that a wrong passphrase says so rather than hanging, and that the
 * screens send people to the right place.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VaultProvider } from './vault-provider';
import { MemoryKeyStore } from './memory-key-store';
import type { CryptoEngine } from '@/lib/crypto/engine';
import { EnvelopeError, type SealedEnvelope } from '@/lib/crypto';

import SetupPage from '@/app/(app)/setup/page';
import UnlockPage from '@/app/(app)/unlock/page';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const RECOVERY_CODE = 'FGK1-4TQ9M-XK2WP-7HZR3-BN5VD-2GKQW-8MXTZ-5PJH4-9WRNC-3TVQ6-6KDYM';
const ENVELOPE = { v: 1, alg: 'A256GCM', iv: 'aa', ct: 'bb' } as SealedEnvelope;
const KEY = { type: 'secret' } as unknown as CryptoKey;
const RIGHT = 'the right passphrase';

/** Instant stand-in, so these tests exercise the UI rather than Argon2id. */
const fakeEngine: CryptoEngine = {
  async setUpVault() {
    return {
      dek: KEY,
      recoveryCode: RECOVERY_CODE,
      wrappings: [
        {
          via: 'passphrase',
          wrappedDek: ENVELOPE,
          kdfParams: { alg: 'argon2id', m: 1, t: 1, p: 1 },
          salt: 'c2FsdA',
        },
        { via: 'recovery-code', wrappedDek: ENVELOPE, kdfParams: null, salt: 'c2FsdDI' },
      ],
      identity: { publicKey: 'public-key', wrappedPrivateKey: ENVELOPE },
    };
  },
  async unlock(passphrase) {
    if (passphrase !== RIGHT) throw new EnvelopeError('Could not decrypt');
    return KEY;
  },
  async recoverAndRewrap(code) {
    if (code !== RECOVERY_CODE) throw new EnvelopeError('Could not decrypt');
    return {
      dek: KEY,
      passphraseWrapping: {
        via: 'passphrase',
        wrappedDek: ENVELOPE,
        kdfParams: { alg: 'argon2id', m: 1, t: 1, p: 1 },
        salt: 'c2FsdA',
      },
    };
  },
  async changePassphrase() {
    throw new Error('not used here');
  },
};

async function storeWithVault() {
  const store = new MemoryKeyStore();
  const family = await store.createFamily('Whitfield');
  await store.saveWrappings(family.id, (await fakeEngine.setUpVault('x')).wrappings);
  return { store, family };
}

function renderWithVault(ui: React.ReactNode, store: MemoryKeyStore) {
  return render(
    <VaultProvider engine={fakeEngine} store={store}>
      {ui}
    </VaultProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  window.print = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:kit');
  URL.revokeObjectURL = vi.fn();
});

describe('setting up a vault', () => {
  it('will not submit until the passphrase is long enough and confirmed', async () => {
    const user = userEvent.setup();
    renderWithVault(<SetupPage />, new MemoryKeyStore());

    const create = await screen.findByRole('button', { name: /create my vault/i });
    expect(create).toBeDisabled();

    await user.type(screen.getByLabelText(/what should we call your family/i), 'Whitfield');
    expect(create).toBeDisabled();

    await user.type(screen.getByLabelText('Choose a passphrase'), 'short');
    expect(create).toBeDisabled();
    expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Choose a passphrase'));
    await user.type(screen.getByLabelText('Choose a passphrase'), RIGHT);
    expect(create).toBeDisabled();

    await user.type(screen.getByLabelText('Type it once more'), 'something else');
    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(create).toBeDisabled();

    await user.clear(screen.getByLabelText('Type it once more'));
    await user.type(screen.getByLabelText('Type it once more'), RIGHT);
    expect(create).toBeEnabled();
  });

  it('persists the keys before showing the recovery kit', async () => {
    const user = userEvent.setup();
    const store = new MemoryKeyStore();
    renderWithVault(<SetupPage />, store);

    await user.type(
      await screen.findByLabelText(/what should we call your family/i),
      'Whitfield',
    );
    await user.type(screen.getByLabelText('Choose a passphrase'), RIGHT);
    await user.type(screen.getByLabelText('Type it once more'), RIGHT);
    await user.click(screen.getByRole('button', { name: /create my vault/i }));

    await screen.findByText(/only other way into your vault/i);

    // Abandoning the kit screen must leave a usable vault behind, not a family
    // with no keys — so the writes have to have happened by now.
    const families = await store.loadFamilies();
    expect(families).toHaveLength(1);
    expect(await store.loadWrappings(families[0].id)).toHaveLength(2);
    expect(await store.loadIdentity()).not.toBeNull();
  });

  it('reaches the vault only after the recovery challenge is answered', async () => {
    const user = userEvent.setup();
    renderWithVault(<SetupPage />, new MemoryKeyStore());

    await user.type(
      await screen.findByLabelText(/what should we call your family/i),
      'Whitfield',
    );
    await user.type(screen.getByLabelText('Choose a passphrase'), RIGHT);
    await user.type(screen.getByLabelText('Type it once more'), RIGHT);
    await user.click(screen.getByRole('button', { name: /create my vault/i }));

    const openVault = await screen.findByRole('button', { name: /open my vault/i });
    expect(openVault).toBeDisabled();
    expect(replace).not.toHaveBeenCalled();

    // Work out which group is being asked for and answer it.
    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    const label = screen.getByText(/Type the \w+ group/).textContent ?? '';
    const index = ordinals.findIndex((ordinal) => label.includes(ordinal));
    const groups = RECOVERY_CODE.replace('FGK1-', '').split('-');

    await user.click(screen.getByLabelText(/saved this code somewhere safe/i));
    await user.type(screen.getByRole('textbox'), groups[index]);
    await user.click(openVault);

    expect(replace).toHaveBeenCalledWith('/vault');
  });

  it('offers to finish a setup that was abandoned halfway', async () => {
    const store = new MemoryKeyStore();
    await store.createFamily('Okonkwo');

    renderWithVault(<SetupPage />, store);

    // The family name is already settled, so it is not asked for again.
    expect(await screen.findByText(/picking up where you left off/i)).toBeInTheDocument();
    expect(screen.getByText(/Okonkwo/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/what should we call your family/i)).not.toBeInTheDocument();
  });

  it('does not create a second family when resuming', async () => {
    const user = userEvent.setup();
    const store = new MemoryKeyStore();
    const family = await store.createFamily('Okonkwo');

    renderWithVault(<SetupPage />, store);
    await screen.findByText(/picking up where you left off/i);

    await user.type(screen.getByLabelText('Choose a passphrase'), RIGHT);
    await user.type(screen.getByLabelText('Type it once more'), RIGHT);
    await user.click(screen.getByRole('button', { name: /create my vault/i }));

    await screen.findByText(/only other way into your vault/i);

    expect(await store.loadFamilies()).toHaveLength(1);
    expect(await store.loadWrappings(family.id)).toHaveLength(2);
  });
});

describe('unlocking', () => {
  it('greets a returning member by family name', async () => {
    const { store } = await storeWithVault();
    renderWithVault(<UnlockPage />, store);

    expect(await screen.findByText(/Unlock Whitfield/)).toBeInTheDocument();
  });

  it('opens the vault with the right passphrase', async () => {
    const user = userEvent.setup();
    const { store } = await storeWithVault();
    renderWithVault(<UnlockPage />, store);

    await user.type(await screen.findByLabelText('Passphrase'), RIGHT);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/vault'));
  });

  it('says the passphrase is wrong rather than talking about decryption', async () => {
    const user = userEvent.setup();
    const { store } = await storeWithVault();
    renderWithVault(<UnlockPage />, store);

    await user.type(await screen.findByLabelText('Passphrase'), 'a guess');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /passphrase does not open this vault/i,
    );
    expect(replace).not.toHaveBeenCalledWith('/vault');
  });

  it('lets someone try again after a wrong guess', async () => {
    const user = userEvent.setup();
    const { store } = await storeWithVault();
    renderWithVault(<UnlockPage />, store);

    const field = await screen.findByLabelText('Passphrase');
    await user.type(field, 'a guess');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByRole('alert');

    await user.clear(field);
    await user.type(field, RIGHT);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/vault'));
  });

  it('sends someone with no vault to setup instead', async () => {
    renderWithVault(<UnlockPage />, new MemoryKeyStore());
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/setup'));
  });
});
