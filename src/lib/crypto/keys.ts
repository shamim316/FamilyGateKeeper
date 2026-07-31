/**
 * The key hierarchy.
 *
 *   passphrase ──Argon2id──► KEK ─┐
 *   recovery code ──HKDF────────► ├─unwraps──► family DEK ──unwraps──► record CEK ──► field
 *   device passkey ─────────────► ┘
 *
 * Three independent wrappings of one data key. Each is a separate path back to
 * the family's data; losing every one of them loses the data, which onboarding
 * has to say out loud.
 *
 * Per-record content keys cost one extra row each and are what make sharing a
 * single record with another family possible without handing over the DEK.
 */

import { sealBytes, openBytes, type SealedEnvelope } from './envelope';
import { randomBytes, wipe } from './bytes';

const KEY_LENGTH_BYTES = 32;

const DEK_CONTEXT = 'fgk/v1/dek';
const CEK_CONTEXT = 'fgk/v1/cek';

/** How a wrapped key is stored: opaque ciphertext plus the label of its unwrapping path. */
export interface WrappedKey {
  envelope: SealedEnvelope;
  /** Which credential unwraps this copy. Purely informational for the UI. */
  via: 'passphrase' | 'recovery-code' | 'device' | 'member-public-key';
}

async function importAesKey(raw: Uint8Array, extractable: boolean): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, extractable, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Generates a new family data key.
 *
 * Returns the raw bytes as well as the key, because signup has to wrap the DEK
 * under several credentials before it can forget the material. Callers must
 * `wipe()` the raw bytes once every wrapping is done.
 */
export async function generateDek(): Promise<{ key: CryptoKey; raw: Uint8Array }> {
  const raw = randomBytes(KEY_LENGTH_BYTES);
  const key = await importAesKey(raw, false);
  return { key, raw };
}

/** Wraps raw DEK bytes under a key-encryption key. */
export async function wrapDek(
  kek: CryptoKey,
  dekRaw: Uint8Array,
  via: WrappedKey['via'],
): Promise<WrappedKey> {
  return { envelope: await sealBytes(kek, dekRaw, DEK_CONTEXT), via };
}

/**
 * Unwraps the family data key.
 *
 * `extractable` defaults to false, which is what normal browsing wants: an XSS
 * payload can then use the key but never exfiltrate it. Key management —
 * inviting a member, rotating a recovery code — needs the raw bytes, and asks
 * for them explicitly so those call sites are easy to audit.
 */
export async function unwrapDek(
  kek: CryptoKey,
  wrapped: WrappedKey,
  options: { extractable?: boolean } = {},
): Promise<{ key: CryptoKey; raw?: Uint8Array }> {
  const raw = await openBytes(kek, wrapped.envelope);
  const extractable = options.extractable ?? false;
  const key = await importAesKey(raw, extractable);

  if (extractable) {
    return { key, raw };
  }
  wipe(raw);
  return { key };
}

/** Creates a content key for a single record, wrapped under the family DEK. */
export async function generateCek(
  dek: CryptoKey,
): Promise<{ key: CryptoKey; wrapped: SealedEnvelope }> {
  const raw = randomBytes(KEY_LENGTH_BYTES);
  const key = await importAesKey(raw, false);
  const wrapped = await sealBytes(dek, raw, CEK_CONTEXT);
  wipe(raw);
  return { key, wrapped };
}

export async function unwrapCek(
  dek: CryptoKey,
  wrapped: SealedEnvelope,
  options: { extractable?: boolean } = {},
): Promise<{ key: CryptoKey; raw?: Uint8Array }> {
  const raw = await openBytes(dek, wrapped);
  const extractable = options.extractable ?? false;
  const key = await importAesKey(raw, extractable);

  if (extractable) {
    return { key, raw };
  }
  wipe(raw);
  return { key };
}

/**
 * Re-wraps an existing DEK under a second credential — adding a recovery code
 * to an account, or registering a new device. The DEK itself does not change,
 * so nothing already encrypted has to be touched.
 */
export async function addDekWrapping(
  dekRaw: Uint8Array,
  newKek: CryptoKey,
  via: WrappedKey['via'],
): Promise<WrappedKey> {
  return wrapDek(newKek, dekRaw, via);
}
