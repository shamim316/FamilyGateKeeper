/**
 * Stops the vault passphrase from being the account password.
 *
 * With password sign-in there are two secrets, and people reuse. That is
 * ordinarily a mild sin; here it is fatal. The account password is sent to
 * Supabase and stored as a hash it can verify. The vault passphrase must never
 * be verifiable by anyone but the person typing it — the moment the two are the
 * same, whoever holds the auth database holds the key to the vault, and the
 * end-to-end encryption is decoration.
 *
 * So the two are compared, and a match is refused rather than warned about.
 *
 * What is kept is a SHA-256 digest, not the password. It lives in a module
 * variable for the few seconds between creating an account and choosing a
 * passphrase, and is discarded as soon as the vault exists.
 */

import { sha256 } from '@noble/hashes/sha256';
import { toBase64Url, utf8ToBytes } from '@/lib/crypto/bytes';

let digest: string | null = null;

function digestOf(secret: string): string {
  return toBase64Url(sha256(utf8ToBytes(secret.normalize('NFKC'))));
}

/** Called after a successful sign-up or sign-in, never persisted. */
export function rememberAccountPassword(password: string): void {
  digest = digestOf(password);
}

/**
 * True when the proposed passphrase is the account password.
 *
 * Returns false when nothing is remembered — a returning member finishing setup
 * in a later session. The check is best-effort by nature; it cannot be enforced
 * for a password typed on another day, which is why the wording on the form
 * says so as well.
 */
export function isAccountPassword(passphrase: string): boolean {
  if (digest === null || passphrase === '') return false;
  return digestOf(passphrase) === digest;
}

/** True when a comparison is possible at all. */
export function canCheckAgainstAccountPassword(): boolean {
  return digest !== null;
}

export function forgetAccountPassword(): void {
  digest = null;
}
