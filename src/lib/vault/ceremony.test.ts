import { describe, expect, it } from 'vitest';
import { directEngine } from '@/lib/crypto/engine';
import { EnvelopeError, seal, open } from '@/lib/crypto/envelope';
import { MemoryKeyStore } from './memory-key-store';
import {
  readVaultStatus,
  setUpVault,
  unlockVault,
  recoverVault,
  changePassphrase,
} from './ceremony';
import { KeyStoreError } from './key-store';
import {
  chooseChallengeIndex,
  isChallengeAnswerCorrect,
  recoveryCodeGroups,
  recoveryKitFilename,
  recoveryKitText,
} from './recovery-kit';

const SLOW = 60_000;

describe('what the app should show after signing in', () => {
  it('asks a brand-new account to create a family', async () => {
    expect(await readVaultStatus(new MemoryKeyStore())).toEqual({ state: 'family-missing' });
  });

  it('resumes a setup that was abandoned after the family was created', async () => {
    const store = new MemoryKeyStore();
    const family = await store.createFamily('Whitfield');

    // Exactly the state a closed tab between the two writes leaves behind.
    expect(await readVaultStatus(store)).toEqual({ state: 'keys-missing', family });
  });

  it('asks a returning member to unlock', { timeout: SLOW }, async () => {
    const store = new MemoryKeyStore();
    await setUpVault(directEngine, store, {
      familyName: 'Whitfield',
      passphrase: 'a passphrase to remember',
    });

    const status = await readVaultStatus(store);
    expect(status.state).toBe('locked');
    if (status.state !== 'locked') return;
    expect(status.family.name).toBe('Whitfield');
    expect(status.wrapping.via).toBe('passphrase');
  });
});

describe('setting up a vault', () => {
  it('creates the family, stores both wrappings, and returns a usable key', { timeout: SLOW }, async () => {
    const store = new MemoryKeyStore();

    const result = await setUpVault(directEngine, store, {
      familyName: 'Okonkwo',
      passphrase: 'sixteen ostriches marching',
    });

    expect(result.family.name).toBe('Okonkwo');
    expect(result.recoveryCode).toMatch(/^FGK1-/);

    const stored = await store.loadWrappings(result.family.id);
    expect(stored.map((wrapping) => wrapping.via).sort()).toEqual(['passphrase', 'recovery-code']);
    expect(await store.loadIdentity()).not.toBeNull();

    const envelope = await seal(result.dek, 'SSN 123-45-6789');
    expect(await open(result.dek, envelope)).toBe('SSN 123-45-6789');
  });

  it('can finish a setup whose family row already exists', { timeout: SLOW }, async () => {
    const store = new MemoryKeyStore();
    const family = await store.createFamily('Whitfield');

    await setUpVault(directEngine, store, {
      familyName: 'ignored',
      passphrase: 'a passphrase to remember',
      existingFamily: family,
    });

    expect((await store.loadFamilies()).length).toBe(1);
    expect((await store.loadWrappings(family.id)).length).toBe(2);
  });

  it('sends nothing readable to the store', { timeout: SLOW }, async () => {
    const store = new MemoryKeyStore();
    const passphrase = 'purple otter marching band';

    const result = await setUpVault(directEngine, store, {
      familyName: 'Whitfield',
      passphrase,
    });

    // The same assertion the crypto suite makes about the database row, at the
    // boundary the application actually writes through.
    const written = store.everythingWritten();
    expect(written).not.toContain(passphrase);
    expect(written).not.toContain(result.recoveryCode);

    // The family name is tier 0 and stays readable on purpose.
    expect(written).toContain('Whitfield');
  });
});

describe('unlocking', () => {
  it('opens the vault and reads back what was stored', { timeout: SLOW }, async () => {
    const store = new MemoryKeyStore();
    const setup = await setUpVault(directEngine, store, {
      familyName: 'Whitfield',
      passphrase: 'the real passphrase',
    });
    const envelope = await seal(setup.dek, 'garage code 4417');

    const status = await readVaultStatus(store);
    if (status.state !== 'locked') throw new Error('expected a locked vault');

    const dek = await unlockVault(directEngine, store, {
      wrapping: status.wrapping,
      passphrase: 'the real passphrase',
    });

    expect(await open(dek, envelope)).toBe('garage code 4417');
  });

  it('refuses the wrong passphrase', { timeout: SLOW }, async () => {
    const store = new MemoryKeyStore();
    await setUpVault(directEngine, store, {
      familyName: 'Whitfield',
      passphrase: 'the real passphrase',
    });

    const status = await readVaultStatus(store);
    if (status.state !== 'locked') throw new Error('expected a locked vault');

    await expect(
      unlockVault(directEngine, store, { wrapping: status.wrapping, passphrase: 'a guess' }),
    ).rejects.toThrow(EnvelopeError);
  });

  it('still opens if stamping last-used fails', { timeout: SLOW }, async () => {
    const store = new MemoryKeyStore();
    store.markUsed = async () => {
      throw new Error('network down');
    };

    const setup = await setUpVault(directEngine, store, {
      familyName: 'Whitfield',
      passphrase: 'the real passphrase',
    });
    const envelope = await seal(setup.dek, 'still fine');

    const status = await readVaultStatus(store);
    if (status.state !== 'locked') throw new Error('expected a locked vault');

    const dek = await unlockVault(directEngine, store, {
      wrapping: status.wrapping,
      passphrase: 'the real passphrase',
    });
    expect(await open(dek, envelope)).toBe('still fine');
  });
});

describe('the whole forgotten-passphrase journey', () => {
  it('recovers, re-wraps, and leaves the old passphrase dead', { timeout: SLOW }, async () => {
    const store = new MemoryKeyStore();

    const setup = await setUpVault(directEngine, store, {
      familyName: 'Whitfield',
      passphrase: 'forgotten by spring',
    });
    const envelope = await seal(setup.dek, 'safe combination 12-34-56');

    // A year later, only the printed sheet survives.
    const dek = await recoverVault(directEngine, store, {
      familyId: setup.family.id,
      recoveryCode: setup.recoveryCode,
      newPassphrase: 'one I will actually remember',
    });
    expect(await open(dek, envelope)).toBe('safe combination 12-34-56');

    // The replaced wrapping is what a fresh sign-in will load.
    const status = await readVaultStatus(store);
    if (status.state !== 'locked') throw new Error('expected a locked vault');

    const reopened = await unlockVault(directEngine, store, {
      wrapping: status.wrapping,
      passphrase: 'one I will actually remember',
    });
    expect(await open(reopened, envelope)).toBe('safe combination 12-34-56');

    await expect(
      unlockVault(directEngine, store, {
        wrapping: status.wrapping,
        passphrase: 'forgotten by spring',
      }),
    ).rejects.toThrow(EnvelopeError);

    // Still exactly one passphrase wrapping — replaced, not accumulated.
    const wrappings = await store.loadWrappings(setup.family.id);
    expect(wrappings.filter((w) => w.via === 'passphrase').length).toBe(1);
  });

  it('rejects a recovery code from a different vault', { timeout: SLOW }, async () => {
    const store = new MemoryKeyStore();
    const setup = await setUpVault(directEngine, store, {
      familyName: 'Whitfield',
      passphrase: 'whatever',
    });

    const other = new MemoryKeyStore();
    const stranger = await setUpVault(directEngine, other, {
      familyName: 'Okonkwo',
      passphrase: 'whatever',
    });

    await expect(
      recoverVault(directEngine, store, {
        familyId: setup.family.id,
        recoveryCode: stranger.recoveryCode,
        newPassphrase: 'new',
      }),
    ).rejects.toThrow(EnvelopeError);
  });

  it('says so plainly when there is no recovery code on file', async () => {
    const store = new MemoryKeyStore();
    const family = await store.createFamily('Whitfield');

    await expect(
      recoverVault(directEngine, store, {
        familyId: family.id,
        recoveryCode: 'FGK1-AAAAA',
        newPassphrase: 'new',
      }),
    ).rejects.toThrow(KeyStoreError);
  });
});

describe('changing a passphrase from settings', () => {
  it('swaps the wrapping and keeps the data readable', { timeout: SLOW }, async () => {
    const store = new MemoryKeyStore();
    const setup = await setUpVault(directEngine, store, {
      familyName: 'Whitfield',
      passphrase: 'first passphrase',
    });
    const envelope = await seal(setup.dek, 'policy 88-2214');

    const status = await readVaultStatus(store);
    if (status.state !== 'locked') throw new Error('expected a locked vault');

    await changePassphrase(directEngine, store, {
      wrapping: status.wrapping,
      currentPassphrase: 'first passphrase',
      newPassphrase: 'second passphrase',
    });

    const after = await readVaultStatus(store);
    if (after.state !== 'locked') throw new Error('expected a locked vault');

    const dek = await unlockVault(directEngine, store, {
      wrapping: after.wrapping,
      passphrase: 'second passphrase',
    });
    expect(await open(dek, envelope)).toBe('policy 88-2214');
  });
});

describe('the recovery kit ceremony', () => {
  const code = 'FGK1-4TQ9M-XK2WP-7HZR3-BN5VD-2GKQW-8MXTZ-5PJH4-9WRNC-3TVQ6-6KDYM';

  it('splits a code into its printed groups', () => {
    const groups = recoveryCodeGroups(code);
    expect(groups.length).toBe(10);
    expect(groups[0]).toBe('4TQ9M');
    expect(groups.every((group) => group.length === 5)).toBe(true);
  });

  it('never challenges on the first group', () => {
    // The first group is glanced at while reading the code and proves least.
    for (const draw of [0, 0.25, 0.5, 0.99]) {
      expect(chooseChallengeIndex(10, () => draw)).toBeGreaterThan(0);
    }
  });

  it('stays within range', () => {
    for (const draw of [0, 0.999999]) {
      const index = chooseChallengeIndex(10, () => draw);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(10);
    }
  });

  it('accepts the right group, however it was typed', () => {
    expect(isChallengeAnswerCorrect(code, 2, '7HZR3')).toBe(true);
    expect(isChallengeAnswerCorrect(code, 2, '7hzr3')).toBe(true);
    expect(isChallengeAnswerCorrect(code, 2, ' 7HZR3 ')).toBe(true);
    // The classic misreadings off a printed sheet.
    expect(isChallengeAnswerCorrect(code, 4, '2GKQW')).toBe(true);
    expect(isChallengeAnswerCorrect(code, 8, '3TVQ6')).toBe(true);
  });

  it('rejects the wrong group, a near miss, and an empty answer', () => {
    expect(isChallengeAnswerCorrect(code, 2, '4TQ9M')).toBe(false);
    expect(isChallengeAnswerCorrect(code, 2, '7HZR4')).toBe(false);
    expect(isChallengeAnswerCorrect(code, 2, '')).toBe(false);
    expect(isChallengeAnswerCorrect(code, 2, '   ')).toBe(false);
    expect(isChallengeAnswerCorrect(code, 99, '7HZR3')).toBe(false);
  });

  it('writes a kit that says what happens if it is lost', () => {
    const text = recoveryKitText({
      code,
      familyName: 'Whitfield',
      createdOn: new Date('2026-07-31T12:00:00Z'),
    });

    expect(text).toContain(code);
    expect(text).toContain('Whitfield');
    expect(text).toContain('2026-07-31');
    expect(text).toMatch(/YOUR DATA IS GONE/);
  });

  it('names the file something findable a year later', () => {
    expect(recoveryKitFilename('The Whitfields!', new Date('2026-07-31T12:00:00Z'))).toBe(
      'gate-keeper-recovery-the-whitfields-2026-07-31.txt',
    );
    expect(recoveryKitFilename('***', new Date('2026-07-31T12:00:00Z'))).toBe(
      'gate-keeper-recovery-family-2026-07-31.txt',
    );
  });
});
