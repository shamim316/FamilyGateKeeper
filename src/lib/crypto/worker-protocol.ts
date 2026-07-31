/**
 * The message shapes exchanged with the crypto worker.
 *
 * Kept in its own module so the worker and its client agree on the protocol
 * without either importing the other — a worker entry point pulled into the
 * main bundle would defeat the point of having one.
 *
 * Note what does and does not appear in these types. Passphrases and recovery
 * codes go *in*; `CryptoKey` objects come back out. Raw key bytes appear
 * nowhere, because they never leave the worker.
 */

import type { RecoveryResult, VaultSetup, WrappingRecord } from './engine';

export type CryptoRequest =
  | { id: number; op: 'setUpVault'; passphrase: string }
  | { id: number; op: 'unlock'; passphrase: string; wrapping: WrappingRecord }
  | {
      id: number;
      op: 'recoverAndRewrap';
      recoveryCode: string;
      wrapping: WrappingRecord;
      newPassphrase: string;
    }
  | {
      id: number;
      op: 'changePassphrase';
      currentPassphrase: string;
      wrapping: WrappingRecord;
      newPassphrase: string;
    };

export type CryptoResponse =
  | { id: number; ok: true; op: 'setUpVault'; result: VaultSetup }
  | { id: number; ok: true; op: 'unlock'; result: CryptoKey }
  | { id: number; ok: true; op: 'recoverAndRewrap'; result: RecoveryResult }
  | {
      id: number;
      ok: true;
      op: 'changePassphrase';
      result: { dek: CryptoKey; passphraseWrapping: WrappingRecord };
    }
  | { id: number; ok: false; name: string; message: string };
