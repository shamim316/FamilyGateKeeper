/**
 * The vault key ceremonies, one level above the primitives in this directory.
 *
 * Everything here composes `envelope`, `kdf`, `keys`, `recovery`, and
 * `asymmetric`; none of it invents cryptography. The point of the layer is to
 * make the three flows that matter — first setup, unlock, and recovery —
 * single operations that can run entirely inside a Web Worker, so that raw key
 * bytes and the passphrase never cross back to the main thread.
 *
 * `CryptoEngine` is an interface because Argon2id belongs in a worker in the
 * browser but nowhere near one in a test. `directEngine` runs inline;
 * `workerEngine` (see ./worker-engine.ts) posts messages. The ceremonies in
 * src/lib/vault are written against the interface and never know which they
 * have.
 */

import { fromBase64Url, toBase64Url, randomBytes, wipe } from './bytes';
import { sealBytes, openBytes, type SealedEnvelope } from './envelope';
import { deriveKek, newKdfParams, type KdfParams } from './kdf';
import { generateDek, wrapDek, unwrapDek } from './keys';
import { deriveRecoveryKek, generateRecoveryCode } from './recovery';
import { generateKeyPair } from './asymmetric';
import { VaultKeyError } from './errors';

export { VaultKeyError };

/** Argon2id settings minus the salt, which is stored in its own column. */
export type KdfSettings = Omit<KdfParams, 'salt'>;

export type WrappingVia = 'passphrase' | 'recovery-code' | 'device' | 'member-public-key';

/**
 * A wrapped data key in the shape the database stores it: see the
 * `member_key_wrappings` table in 0001_foundation.sql.
 *
 * The salt lives in its own column rather than inside `kdfParams` so both
 * derivation paths can use the same field — Argon2id for a passphrase, HKDF
 * for a recovery code — with no chance of the two copies drifting apart.
 */
export interface WrappingRecord {
  via: WrappingVia;
  wrappedDek: SealedEnvelope;
  kdfParams: KdfSettings | null;
  salt: string | null;
  label?: string | null;
}

export interface IdentityRecord {
  publicKey: string;
  wrappedPrivateKey: SealedEnvelope;
}

export interface VaultSetup {
  /** Non-extractable, in memory only, valid until the vault locks. */
  dek: CryptoKey;
  /** Shown once, on the recovery kit screen, and never stored anywhere. */
  recoveryCode: string;
  wrappings: WrappingRecord[];
  identity: IdentityRecord;
}

export interface RecoveryResult {
  dek: CryptoKey;
  /** Replaces the old passphrase wrapping. The recovery code itself still works. */
  passphraseWrapping: WrappingRecord;
}

export interface CryptoEngine {
  setUpVault(passphrase: string): Promise<VaultSetup>;

  unlock(passphrase: string, wrapping: WrappingRecord): Promise<CryptoKey>;

  recoverAndRewrap(
    recoveryCode: string,
    wrapping: WrappingRecord,
    newPassphrase: string,
  ): Promise<RecoveryResult>;

  changePassphrase(
    currentPassphrase: string,
    wrapping: WrappingRecord,
    newPassphrase: string,
  ): Promise<{ dek: CryptoKey; passphraseWrapping: WrappingRecord }>;
}

const IDENTITY_CONTEXT = 'fgk/v1/identity-key';
const RECOVERY_SALT_BYTES = 16;

/** Rebuilds the full KdfParams a passphrase wrapping needs to derive its KEK. */
function kdfParamsFor(wrapping: WrappingRecord): KdfParams {
  if (!wrapping.kdfParams || !wrapping.salt) {
    throw new VaultKeyError('Passphrase wrapping is missing its derivation settings');
  }
  return { ...wrapping.kdfParams, salt: wrapping.salt };
}

async function wrapUnderPassphrase(
  passphrase: string,
  dekRaw: Uint8Array<ArrayBuffer>,
): Promise<WrappingRecord> {
  const params = newKdfParams();
  const kek = await deriveKek(passphrase, params);
  const { envelope } = await wrapDek(kek, dekRaw, 'passphrase');

  const { salt, ...settings } = params;
  return { via: 'passphrase', wrappedDek: envelope, kdfParams: settings, salt };
}

export const directEngine: CryptoEngine = {
  async setUpVault(passphrase: string): Promise<VaultSetup> {
    const { raw: dekRaw } = await generateDek();

    try {
      const passphraseWrapping = await wrapUnderPassphrase(passphrase, dekRaw);

      // The second, independent path back to the data.
      const recoveryCode = generateRecoveryCode();
      const recoverySalt = randomBytes(RECOVERY_SALT_BYTES);
      const recoveryKek = await deriveRecoveryKek(recoveryCode, recoverySalt);
      const recoveryWrapped = await wrapDek(recoveryKek, dekRaw, 'recovery-code');

      // Unwrapping what we just wrapped costs one cheap AES operation and
      // turns "the passphrase wrapping is broken" from a bug discovered at the
      // next sign-in into one discovered before the row is even written.
      const kek = await deriveKek(passphrase, kdfParamsFor(passphraseWrapping));
      const { key: dek } = await unwrapDek(kek, {
        envelope: passphraseWrapping.wrappedDek,
        via: 'passphrase',
      });

      // The identity private key is sealed under the DEK rather than the KEK.
      // Sealing it under the passphrase would orphan it the moment someone
      // recovers with their code and picks a new passphrase.
      const keyPair = generateKeyPair();
      const privateKeyBytes = fromBase64Url(keyPair.privateKey);
      const wrappedPrivateKey = await sealBytes(dek, privateKeyBytes, IDENTITY_CONTEXT);
      wipe(privateKeyBytes);

      return {
        dek,
        recoveryCode,
        wrappings: [
          passphraseWrapping,
          {
            via: 'recovery-code',
            wrappedDek: recoveryWrapped.envelope,
            kdfParams: null,
            salt: toBase64Url(recoverySalt),
          },
        ],
        identity: { publicKey: keyPair.publicKey, wrappedPrivateKey },
      };
    } finally {
      wipe(dekRaw);
    }
  },

  async unlock(passphrase: string, wrapping: WrappingRecord): Promise<CryptoKey> {
    const kek = await deriveKek(passphrase, kdfParamsFor(wrapping));
    const { key } = await unwrapDek(kek, { envelope: wrapping.wrappedDek, via: 'passphrase' });
    return key;
  },

  async recoverAndRewrap(
    recoveryCode: string,
    wrapping: WrappingRecord,
    newPassphrase: string,
  ): Promise<RecoveryResult> {
    if (!wrapping.salt) {
      throw new VaultKeyError('Recovery wrapping is missing its salt');
    }

    const recoveryKek = await deriveRecoveryKek(recoveryCode, fromBase64Url(wrapping.salt));
    const { raw } = await unwrapDek(
      recoveryKek,
      { envelope: wrapping.wrappedDek, via: 'recovery-code' },
      { extractable: true },
    );

    if (!raw) {
      throw new VaultKeyError('Could not read the data key');
    }

    try {
      const passphraseWrapping = await wrapUnderPassphrase(newPassphrase, raw);
      const kek = await deriveKek(newPassphrase, kdfParamsFor(passphraseWrapping));
      const { key: dek } = await unwrapDek(kek, {
        envelope: passphraseWrapping.wrappedDek,
        via: 'passphrase',
      });
      return { dek, passphraseWrapping };
    } finally {
      wipe(raw);
    }
  },

  async changePassphrase(
    currentPassphrase: string,
    wrapping: WrappingRecord,
    newPassphrase: string,
  ) {
    const currentKek = await deriveKek(currentPassphrase, kdfParamsFor(wrapping));
    const { raw } = await unwrapDek(
      currentKek,
      { envelope: wrapping.wrappedDek, via: 'passphrase' },
      { extractable: true },
    );

    if (!raw) {
      throw new VaultKeyError('Could not read the data key');
    }

    try {
      const passphraseWrapping = await wrapUnderPassphrase(newPassphrase, raw);
      const kek = await deriveKek(newPassphrase, kdfParamsFor(passphraseWrapping));
      const { key: dek } = await unwrapDek(kek, {
        envelope: passphraseWrapping.wrappedDek,
        via: 'passphrase',
      });
      return { dek, passphraseWrapping };
    } finally {
      wipe(raw);
    }
  },
};

/** Opens the identity private key, which is sealed under the family DEK. */
export async function openIdentityPrivateKey(
  dek: CryptoKey,
  identity: IdentityRecord,
): Promise<string> {
  const bytes = await openBytes(dek, identity.wrappedPrivateKey);
  const encoded = toBase64Url(bytes);
  wipe(bytes);
  return encoded;
}
