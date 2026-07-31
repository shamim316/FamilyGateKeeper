/**
 * Asymmetric envelopes, for the two cases where one person has to hand key
 * material to another who is not online:
 *
 *   1. Inviting a family member — the inviter re-wraps the family DEK for the
 *      new member's public key. No shared secret has to travel over email.
 *   2. Sharing with another family — the sharer re-wraps a single record's CEK
 *      for the recipient family's public key, so exactly one record moves and
 *      the DEK never does.
 *
 * This is a standard sealed box: an ephemeral X25519 keypair, ECDH against the
 * recipient's public key, HKDF to an AES-GCM key. The sender is anonymous and
 * cannot themselves reopen the envelope, which is the correct property here.
 */

import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { asBytes, fromBase64Url, toBase64Url, utf8ToBytes, wipe, type Bytes } from './bytes';
import { sealBytes, openBytes, type SealedEnvelope } from './envelope';

const HKDF_INFO = 'fgk/v1/sealed-box';

export interface KeyPairMaterial {
  /** Base64url X25519 public key. Stored in the clear. */
  publicKey: string;
  /** Base64url X25519 private key. Never stored unsealed. */
  privateKey: string;
}

export interface SealedBox {
  v: 1;
  /** Base64url ephemeral public key the recipient needs to complete the ECDH. */
  epk: string;
  envelope: SealedEnvelope;
}

export function generateKeyPair(): KeyPairMaterial {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  const material = {
    publicKey: toBase64Url(publicKey),
    privateKey: toBase64Url(privateKey),
  };
  wipe(privateKey);
  return material;
}

async function deriveSharedKey(
  privateKey: Bytes,
  peerPublicKey: Bytes,
  context: string,
): Promise<CryptoKey> {
  const shared = x25519.getSharedSecret(privateKey, peerPublicKey);
  // Salt is empty by design: the ECDH output already has full entropy, and the
  // context string in `info` is what separates one use of this from another.
  const raw = asBytes(hkdf(sha256, shared, undefined, utf8ToBytes(`${HKDF_INFO}/${context}`), 32));
  wipe(shared);

  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  wipe(raw);
  return key;
}

/** Seals bytes so that only the holder of `recipientPublicKey` can open them. */
export async function sealFor(
  recipientPublicKey: string,
  plaintext: Bytes,
  context: string,
): Promise<SealedBox> {
  const ephemeralPrivate = asBytes(x25519.utils.randomPrivateKey());
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);

  const key = await deriveSharedKey(ephemeralPrivate, fromBase64Url(recipientPublicKey), context);
  wipe(ephemeralPrivate);

  const envelope = await sealBytes(key, plaintext, context);
  return { v: 1, epk: toBase64Url(ephemeralPublic), envelope };
}

export async function openSealed(
  recipientPrivateKey: string,
  box: SealedBox,
  context: string,
): Promise<Bytes> {
  const privateKey = fromBase64Url(recipientPrivateKey);
  const key = await deriveSharedKey(privateKey, fromBase64Url(box.epk), context);
  wipe(privateKey);
  return openBytes(key, box.envelope);
}

/**
 * Context strings keep an envelope minted for one purpose from being replayed
 * into another — a share bundle cannot be passed off as a membership invite.
 */
export const CONTEXT = {
  memberInvite: (familyId: string) => `member-invite/${familyId}`,
  recordShare: (shareId: string) => `record-share/${shareId}`,
} as const;
