import { describe, expect, it } from 'vitest';
import { directEngine, openIdentityPrivateKey, VaultKeyError } from './engine';
import { EnvelopeError, seal, open } from './envelope';
import { isPlausibleRecoveryCode } from './recovery';
import { sealFor, openSealed, CONTEXT } from './asymmetric';
import { randomBytes } from './bytes';

// Each of these derives real Argon2id keys rather than mocking, because the
// thing worth testing is that the actual ceremony works end to end.
const SLOW = 60_000;

describe('setting up a vault', () => {
  it('produces a usable key, a recovery code, and both wrappings', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('a passphrase to remember');

    expect(isPlausibleRecoveryCode(setup.recoveryCode)).toBe(true);
    expect(setup.wrappings.map((w) => w.via).sort()).toEqual(['passphrase', 'recovery-code']);

    // The key works.
    const envelope = await seal(setup.dek, 'garage code 4417');
    expect(await open(setup.dek, envelope)).toBe('garage code 4417');

    // And cannot be read back out of the browser.
    expect(setup.dek.extractable).toBe(false);
  });

  it('gives the passphrase wrapping its derivation settings', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('a passphrase to remember');

    const passphrase = setup.wrappings.find((w) => w.via === 'passphrase')!;
    expect(passphrase.kdfParams?.alg).toBe('argon2id');
    expect(passphrase.salt).toBeTruthy();

    // The recovery path derives from high-entropy material, so it needs a salt
    // but no memory-hard KDF settings. The database check constraint agrees.
    const recovery = setup.wrappings.find((w) => w.via === 'recovery-code')!;
    expect(recovery.kdfParams).toBeNull();
    expect(recovery.salt).toBeTruthy();
  });

  it('never puts the passphrase or a raw key in what gets stored', { timeout: SLOW }, async () => {
    const passphrase = 'sixteen ostriches marching';
    const setup = await directEngine.setUpVault(passphrase);

    const persisted = JSON.stringify({
      wrappings: setup.wrappings,
      identity: setup.identity,
    });

    expect(persisted).not.toContain(passphrase);
    expect(persisted).not.toContain(setup.recoveryCode);
  });

  it('gives every vault a different key', { timeout: SLOW }, async () => {
    const first = await directEngine.setUpVault('same passphrase');
    const second = await directEngine.setUpVault('same passphrase');

    const envelope = await seal(first.dek, 'secret');
    await expect(open(second.dek, envelope)).rejects.toThrow(EnvelopeError);
  });
});

describe('unlocking', () => {
  it('opens the vault with the right passphrase', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('the real passphrase');
    const wrapping = setup.wrappings.find((w) => w.via === 'passphrase')!;

    const envelope = await seal(setup.dek, 'SSN 123-45-6789');

    const dek = await directEngine.unlock('the real passphrase', wrapping);
    expect(await open(dek, envelope)).toBe('SSN 123-45-6789');
  });

  it('refuses the wrong passphrase', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('the real passphrase');
    const wrapping = setup.wrappings.find((w) => w.via === 'passphrase')!;

    await expect(directEngine.unlock('a guess', wrapping)).rejects.toThrow(EnvelopeError);
  });

  it('complains clearly when a wrapping is missing its settings', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('the real passphrase');
    const wrapping = setup.wrappings.find((w) => w.via === 'passphrase')!;

    await expect(
      directEngine.unlock('the real passphrase', { ...wrapping, salt: null }),
    ).rejects.toThrow(VaultKeyError);
  });
});

describe('recovering a forgotten passphrase', () => {
  it('restores access and re-wraps under a new passphrase', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('forgotten by spring');
    const recoveryWrapping = setup.wrappings.find((w) => w.via === 'recovery-code')!;

    // Something was stored before the passphrase was lost.
    const envelope = await seal(setup.dek, 'safe combination 12-34-56');

    const { dek, passphraseWrapping } = await directEngine.recoverAndRewrap(
      setup.recoveryCode,
      recoveryWrapping,
      'a passphrase I will actually remember',
    );

    // The same data key came back, so old ciphertext still opens.
    expect(await open(dek, envelope)).toBe('safe combination 12-34-56');

    // And the new passphrase works from a cold start.
    const reopened = await directEngine.unlock(
      'a passphrase I will actually remember',
      passphraseWrapping,
    );
    expect(await open(reopened, envelope)).toBe('safe combination 12-34-56');
  });

  it('leaves the old passphrase useless', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('the old one');
    const recoveryWrapping = setup.wrappings.find((w) => w.via === 'recovery-code')!;

    const { passphraseWrapping } = await directEngine.recoverAndRewrap(
      setup.recoveryCode,
      recoveryWrapping,
      'the new one',
    );

    await expect(directEngine.unlock('the old one', passphraseWrapping)).rejects.toThrow(
      EnvelopeError,
    );
  });

  it('keeps the recovery code working afterwards', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('the old one');
    const recoveryWrapping = setup.wrappings.find((w) => w.via === 'recovery-code')!;
    const envelope = await seal(setup.dek, 'still readable');

    await directEngine.recoverAndRewrap(setup.recoveryCode, recoveryWrapping, 'the new one');

    // Only the passphrase wrapping was replaced, so the printed sheet in the
    // filing cabinet is still good.
    const again = await directEngine.recoverAndRewrap(
      setup.recoveryCode,
      recoveryWrapping,
      'a third passphrase',
    );
    expect(await open(again.dek, envelope)).toBe('still readable');
  });

  it('refuses a wrong recovery code', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('whatever');
    const recoveryWrapping = setup.wrappings.find((w) => w.via === 'recovery-code')!;
    const other = await directEngine.setUpVault('whatever');

    await expect(
      directEngine.recoverAndRewrap(other.recoveryCode, recoveryWrapping, 'new'),
    ).rejects.toThrow(EnvelopeError);
  });
});

describe('changing a passphrase', () => {
  it('swaps the passphrase without touching the data', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('first passphrase');
    const wrapping = setup.wrappings.find((w) => w.via === 'passphrase')!;
    const envelope = await seal(setup.dek, 'policy 88-2214');

    const { passphraseWrapping } = await directEngine.changePassphrase(
      'first passphrase',
      wrapping,
      'second passphrase',
    );

    const dek = await directEngine.unlock('second passphrase', passphraseWrapping);
    expect(await open(dek, envelope)).toBe('policy 88-2214');
  });

  it('will not change a passphrase without the current one', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('first passphrase');
    const wrapping = setup.wrappings.find((w) => w.via === 'passphrase')!;

    await expect(
      directEngine.changePassphrase('wrong', wrapping, 'second passphrase'),
    ).rejects.toThrow(EnvelopeError);
  });
});

describe('the identity keypair', () => {
  it('survives a passphrase change, because it is sealed under the data key', { timeout: SLOW }, async () => {
    const setup = await directEngine.setUpVault('original passphrase');
    const recoveryWrapping = setup.wrappings.find((w) => w.via === 'recovery-code')!;

    const { dek } = await directEngine.recoverAndRewrap(
      setup.recoveryCode,
      recoveryWrapping,
      'brand new passphrase',
    );

    // This is the regression this arrangement exists to prevent: sealed under
    // the passphrase KEK instead, the private key would now be unreadable.
    const privateKey = await openIdentityPrivateKey(dek, setup.identity);

    const payload = randomBytes(32);
    const box = await sealFor(setup.identity.publicKey, payload, CONTEXT.memberInvite('family-1'));
    const opened = await openSealed(privateKey, box, CONTEXT.memberInvite('family-1'));

    expect([...opened]).toEqual([...payload]);
  });
});
