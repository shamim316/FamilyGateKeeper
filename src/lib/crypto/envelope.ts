/**
 * The sealed envelope: the only shape in which secret values are stored.
 *
 * Every envelope is self-describing. The version and algorithm travel with the
 * ciphertext so the format can change without a migration that would have to
 * decrypt data the server cannot read.
 */

import { fromBase64Url, randomBytes, toBase64Url, utf8ToBytes, bytesToUtf8 } from './bytes';

export const ENVELOPE_VERSION = 1 as const;
const IV_LENGTH = 12; // AES-GCM standard nonce length

export interface SealedEnvelope {
  /** Envelope format version. */
  v: number;
  /** Algorithm identifier. Only A256GCM exists today. */
  alg: 'A256GCM';
  /** Base64url nonce. */
  iv: string;
  /** Base64url ciphertext with the GCM tag appended. */
  ct: string;
  /**
   * Additional authenticated data, stored in the clear. Binds the ciphertext to
   * the field it belongs to, so an attacker with write access to the database
   * cannot move a sealed SSN into someone else's record and have it decrypt.
   */
  aad?: string;
}

export function isSealedEnvelope(value: unknown): value is SealedEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.v === 'number' &&
    candidate.alg === 'A256GCM' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.ct === 'string' &&
    (candidate.aad === undefined || typeof candidate.aad === 'string')
  );
}

/**
 * Builds the AAD string that binds a ciphertext to one field of one record.
 * Changing any component makes the envelope fail to open, which is the point.
 */
export function fieldContext(table: string, recordId: string, field: string): string {
  return `fgk/v1/${table}/${recordId}/${field}`;
}

export async function seal(
  key: CryptoKey,
  plaintext: string,
  aad?: string,
): Promise<SealedEnvelope> {
  const iv = randomBytes(IV_LENGTH);
  const params: AesGcmParams = { name: 'AES-GCM', iv };
  if (aad !== undefined) {
    params.additionalData = utf8ToBytes(aad);
  }

  const ciphertext = await crypto.subtle.encrypt(params, key, utf8ToBytes(plaintext));

  return {
    v: ENVELOPE_VERSION,
    alg: 'A256GCM',
    iv: toBase64Url(iv),
    ct: toBase64Url(new Uint8Array(ciphertext)),
    ...(aad !== undefined ? { aad } : {}),
  };
}

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

export async function open(key: CryptoKey, envelope: SealedEnvelope): Promise<string> {
  if (!isSealedEnvelope(envelope)) {
    throw new EnvelopeError('Not a sealed envelope');
  }
  if (envelope.v !== ENVELOPE_VERSION) {
    throw new EnvelopeError(`Unsupported envelope version ${envelope.v}`);
  }

  const params: AesGcmParams = { name: 'AES-GCM', iv: fromBase64Url(envelope.iv) };
  if (envelope.aad !== undefined) {
    params.additionalData = utf8ToBytes(envelope.aad);
  }

  try {
    const plaintext = await crypto.subtle.decrypt(params, key, fromBase64Url(envelope.ct));
    return bytesToUtf8(new Uint8Array(plaintext));
  } catch {
    // WebCrypto gives no detail on GCM failure, and we should not invent one:
    // a wrong key, a tampered ciphertext, and mismatched AAD are all this error.
    throw new EnvelopeError('Could not decrypt — wrong key or altered data');
  }
}

/** Seals raw bytes rather than a string, for wrapped keys and file contents. */
export async function sealBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad?: string,
): Promise<SealedEnvelope> {
  const iv = randomBytes(IV_LENGTH);
  const params: AesGcmParams = { name: 'AES-GCM', iv };
  if (aad !== undefined) {
    params.additionalData = utf8ToBytes(aad);
  }
  const ciphertext = await crypto.subtle.encrypt(params, key, plaintext);
  return {
    v: ENVELOPE_VERSION,
    alg: 'A256GCM',
    iv: toBase64Url(iv),
    ct: toBase64Url(new Uint8Array(ciphertext)),
    ...(aad !== undefined ? { aad } : {}),
  };
}

export async function openBytes(
  key: CryptoKey,
  envelope: SealedEnvelope,
): Promise<Uint8Array> {
  if (!isSealedEnvelope(envelope)) {
    throw new EnvelopeError('Not a sealed envelope');
  }
  if (envelope.v !== ENVELOPE_VERSION) {
    throw new EnvelopeError(`Unsupported envelope version ${envelope.v}`);
  }
  const params: AesGcmParams = { name: 'AES-GCM', iv: fromBase64Url(envelope.iv) };
  if (envelope.aad !== undefined) {
    params.additionalData = utf8ToBytes(envelope.aad);
  }
  try {
    const plaintext = await crypto.subtle.decrypt(params, key, fromBase64Url(envelope.ct));
    return new Uint8Array(plaintext);
  } catch {
    throw new EnvelopeError('Could not decrypt — wrong key or altered data');
  }
}
