/**
 * Recovery codes.
 *
 * The second, independent path to a family's data key. A forgotten passphrase
 * is the single most likely way for a family to lose everything in this app, so
 * the recovery code is generated at signup, shown once, and meant to be printed
 * and put somewhere physical.
 *
 * The code carries 256 bits of entropy, so unlike a passphrase it needs no
 * memory-hard KDF — HKDF is enough, and keeps recovery fast on a phone.
 */

import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes, utf8ToBytes, wipe } from './bytes';

/**
 * Crockford base32: no I, L, O, or U. Removes the 1/l and 0/O confusions that
 * matter when someone is reading a code off a printed sheet a year from now.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUP_SIZE = 5;
const GROUP_COUNT = 10; // 50 characters ≈ 250 bits
const HKDF_INFO = 'fgk/v1/recovery-code';

export const RECOVERY_CODE_PREFIX = 'FGK1';

/**
 * Produces a code shaped like:
 *   FGK1-4TQ9M-XK2WP-...-7HZR3
 */
export function generateRecoveryCode(): string {
  // 32 divides 256, so the low 5 bits of a uniform byte are themselves uniform
  // across the alphabet — no rejection sampling needed.
  const bytes = randomBytes(GROUP_SIZE * GROUP_COUNT);
  const characters = [...bytes].map((byte) => ALPHABET[byte & 0b00011111]);

  const groups: string[] = [];
  for (let i = 0; i < characters.length; i += GROUP_SIZE) {
    groups.push(characters.slice(i, i + GROUP_SIZE).join(''));
  }
  return `${RECOVERY_CODE_PREFIX}-${groups.join('-')}`;
}

/**
 * Accepts whatever the user types: lowercase, missing dashes, spaces, and the
 * classic O-for-0 and I-for-1 substitutions someone makes reading handwriting.
 */
export function normalizeRecoveryCode(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');

  const body = cleaned.startsWith(RECOVERY_CODE_PREFIX)
    ? cleaned.slice(RECOVERY_CODE_PREFIX.length)
    : cleaned;

  return body;
}

export function isPlausibleRecoveryCode(input: string): boolean {
  const body = normalizeRecoveryCode(input);
  if (body.length !== GROUP_SIZE * GROUP_COUNT) return false;
  return [...body].every((char) => ALPHABET.includes(char));
}

/**
 * Turns a recovery code into the key that unwraps the DEK.
 *
 * The salt is stored in the clear next to the wrapped key; it exists to keep
 * two families with (impossibly) the same code from producing the same KEK.
 */
export async function deriveRecoveryKek(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const body = normalizeRecoveryCode(code);
  if (body.length !== GROUP_SIZE * GROUP_COUNT) {
    throw new Error('Recovery code is not the right length');
  }

  const raw = hkdf(sha256, utf8ToBytes(body), salt, utf8ToBytes(HKDF_INFO), 32);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  wipe(raw);
  return key;
}

/** Formats a normalized body back into the printable grouped form. */
export function formatRecoveryCode(body: string): string {
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += GROUP_SIZE) {
    groups.push(body.slice(i, i + GROUP_SIZE));
  }
  return `${RECOVERY_CODE_PREFIX}-${groups.join('-')}`;
}
