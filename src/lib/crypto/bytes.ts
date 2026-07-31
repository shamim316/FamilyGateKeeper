/**
 * Byte and text encoding helpers shared by the crypto module.
 *
 * Everything that crosses the wire or lands in Postgres is base64url so it
 * survives JSON, URLs, and copy-paste without escaping.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A Uint8Array backed by a plain ArrayBuffer rather than a SharedArrayBuffer.
 *
 * WebCrypto refuses shared buffers — a concurrently mutable input would defeat
 * AES-GCM's integrity guarantee — and since TypeScript 5.7 that restriction is
 * expressed in the type. Everything here allocates its own buffer, so the
 * narrowing is accurate; it just is not inferable from `TextEncoder.encode`
 * and the noble hash functions, whose signatures stay deliberately loose.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/** Narrows byte output that is known to own a plain ArrayBuffer. */
export function asBytes(bytes: Uint8Array): Bytes {
  return bytes as Bytes;
}

export function utf8ToBytes(text: string): Bytes {
  return asBytes(encoder.encode(text));
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Bytes {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Comparison that does not leak position of the first difference through timing.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Best-effort overwrite of key material we are done with. JavaScript gives no
 * real guarantee here — the runtime may have copied the buffer — but zeroing
 * shortens the window in which a heap snapshot is useful.
 */
export function wipe(bytes: Uint8Array): void {
  bytes.fill(0);
}
