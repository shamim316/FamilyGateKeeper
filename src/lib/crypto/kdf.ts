/**
 * Passphrase-to-key derivation.
 *
 * Argon2id, because the threat is an offline attack against a stolen database
 * of wrapped keys, and memory-hardness is what makes that expensive. Parameters
 * are stored alongside each wrapped key rather than baked in, so they can be
 * raised later without stranding existing accounts.
 */

import { argon2id } from '@noble/hashes/argon2';
import { asBytes, randomBytes, utf8ToBytes, toBase64Url, fromBase64Url } from './bytes';

export interface KdfParams {
  alg: 'argon2id';
  /** Memory cost in KiB. */
  m: number;
  /** Iterations. */
  t: number;
  /** Parallelism. */
  p: number;
  /** Base64url salt. */
  salt: string;
}

/**
 * Comfortably above OWASP's m=19MiB, t=2, p=1 floor, and measured at roughly a
 * second on a laptop with this pure-JS implementation — call it three on a
 * mid-range phone.
 *
 * That is the ceiling of what a cold unlock can cost before the app feels
 * broken, which is why repeat unlocks go through the device passkey path
 * instead and never touch Argon2 at all. Swapping in a WASM implementation
 * would buy roughly a 10x speedup and room to raise these; because the
 * parameters travel with each wrapped key, that change needs no migration.
 */
export const DEFAULT_KDF_PARAMS: Omit<KdfParams, 'salt'> = {
  alg: 'argon2id',
  m: 32768, // 32 MiB
  t: 2,
  p: 1,
};

export const SALT_LENGTH = 16;

export function newKdfParams(): KdfParams {
  return { ...DEFAULT_KDF_PARAMS, salt: toBase64Url(randomBytes(SALT_LENGTH)) };
}

/**
 * Derives the key-encryption key (KEK) that wraps a family's data key. The KEK
 * is never stored anywhere — it exists only for as long as it takes to unwrap.
 */
export async function deriveKek(passphrase: string, params: KdfParams): Promise<CryptoKey> {
  if (params.alg !== 'argon2id') {
    throw new Error(`Unsupported KDF algorithm: ${params.alg}`);
  }

  const raw = asBytes(
    argon2id(utf8ToBytes(passphrase.normalize('NFKC')), fromBase64Url(params.salt), {
      m: params.m,
      t: params.t,
      p: params.p,
      dkLen: 32,
    }),
  );

  // The KEK only ever wraps and unwraps other keys, and must not be exportable.
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Rough strength signal for the passphrase field during signup. Deliberately
 * not a hard gate: blocking a determined user produces a passphrase on a
 * sticky note, which is worse than a mediocre one they remember.
 */
export function passphraseStrength(passphrase: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  const length = passphrase.length;
  let variety = 0;
  if (/[a-z]/.test(passphrase)) variety += 1;
  if (/[A-Z]/.test(passphrase)) variety += 1;
  if (/[0-9]/.test(passphrase)) variety += 1;
  if (/[^a-zA-Z0-9]/.test(passphrase)) variety += 1;

  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (length >= 8) score = 1;
  if (length >= 12 && variety >= 2) score = 2;
  if (length >= 16 && variety >= 2) score = 3;
  if (length >= 20 || (length >= 16 && variety >= 3)) score = 4;

  const labels = ['Too short', 'Weak', 'Okay', 'Strong', 'Very strong'] as const;
  return { score, label: labels[score] };
}
