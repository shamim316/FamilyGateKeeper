/**
 * The three flows that turn a typed passphrase into an unlocked vault.
 *
 * Each takes its CryptoEngine and KeyStore as arguments rather than importing
 * them, which is what makes them testable end to end without a browser worker
 * or a network. The screens in src/app supply the real ones.
 */

import type { CryptoEngine } from '@/lib/crypto/engine';
import type { FamilySummary, KeyStore, StoredWrapping } from './key-store';
import { KeyStoreError } from './key-store';

/**
 * What the app should show someone who just signed in.
 *
 * `keys-missing` is not a hypothetical: setup creates the family row and the
 * key rows in separate steps, and a closed tab in between leaves exactly this
 * state. It resumes rather than stranding the account.
 */
export type VaultStatus =
  | { state: 'family-missing' }
  | { state: 'keys-missing'; family: FamilySummary }
  | { state: 'locked'; family: FamilySummary; wrapping: StoredWrapping };

export async function readVaultStatus(store: KeyStore): Promise<VaultStatus> {
  const families = await store.loadFamilies();
  if (families.length === 0) {
    return { state: 'family-missing' };
  }

  // One family per account for now. Multi-family arrives with sharing in
  // Milestone 10, and becomes a picker rather than a change of shape here.
  const family = families[0];
  const wrappings = await store.loadWrappings(family.id);
  const passphrase = wrappings.find((wrapping) => wrapping.via === 'passphrase');

  if (!passphrase) {
    return { state: 'keys-missing', family };
  }

  return { state: 'locked', family, wrapping: passphrase };
}

export interface SetUpResult {
  family: FamilySummary;
  dek: CryptoKey;
  /** Shown once on the recovery kit screen. Never persisted, never recoverable. */
  recoveryCode: string;
}

/**
 * First run: create the family, mint the keys, persist them.
 *
 * Persisting before the recovery kit is shown is deliberate. If someone closes
 * the tab on the kit screen, they end up with a working vault whose recovery
 * code they did not write down — annoying, and fixable from settings. The other
 * order would leave them with a family they can never unlock.
 */
export async function setUpVault(
  engine: CryptoEngine,
  store: KeyStore,
  options: { familyName: string; passphrase: string; existingFamily?: FamilySummary },
): Promise<SetUpResult> {
  const family = options.existingFamily ?? (await store.createFamily(options.familyName));

  const setup = await engine.setUpVault(options.passphrase);

  await store.saveWrappings(family.id, setup.wrappings);
  await store.saveIdentity(setup.identity);

  return { family, dek: setup.dek, recoveryCode: setup.recoveryCode };
}

export async function unlockVault(
  engine: CryptoEngine,
  store: KeyStore,
  options: { wrapping: StoredWrapping; passphrase: string },
): Promise<CryptoKey> {
  const dek = await engine.unlock(options.passphrase, options.wrapping);

  // Best effort: a vault that opened should not fail because a bookkeeping
  // column could not be stamped.
  void store.markUsed(options.wrapping.id).catch(() => {});

  return dek;
}

/**
 * Forgotten passphrase.
 *
 * The data key is unchanged, so nothing already encrypted has to be rewritten —
 * only the passphrase wrapping is replaced. The recovery code stays valid,
 * because the sheet in the filing cabinet should not silently stop working the
 * first time it is used.
 */
export async function recoverVault(
  engine: CryptoEngine,
  store: KeyStore,
  options: { familyId: string; recoveryCode: string; newPassphrase: string },
): Promise<CryptoKey> {
  const wrappings = await store.loadWrappings(options.familyId);
  const recovery = wrappings.find((wrapping) => wrapping.via === 'recovery-code');

  if (!recovery) {
    throw new KeyStoreError('This vault has no recovery code on file');
  }

  const { dek, passphraseWrapping } = await engine.recoverAndRewrap(
    options.recoveryCode,
    recovery,
    options.newPassphrase,
  );

  const existing = wrappings.find((wrapping) => wrapping.via === 'passphrase');
  if (existing) {
    await store.replaceWrapping(existing.id, passphraseWrapping);
  } else {
    await store.saveWrappings(options.familyId, [passphraseWrapping]);
  }

  return dek;
}

export async function changePassphrase(
  engine: CryptoEngine,
  store: KeyStore,
  options: { wrapping: StoredWrapping; currentPassphrase: string; newPassphrase: string },
): Promise<CryptoKey> {
  const { dek, passphraseWrapping } = await engine.changePassphrase(
    options.currentPassphrase,
    options.wrapping,
    options.newPassphrase,
  );

  await store.replaceWrapping(options.wrapping.id, passphraseWrapping);
  return dek;
}
