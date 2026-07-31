import { describe, expect, it } from 'vitest';
import {
  seal,
  open,
  sealBytes,
  openBytes,
  fieldContext,
  isSealedEnvelope,
  EnvelopeError,
} from './envelope';
import { deriveKek, newKdfParams, passphraseStrength } from './kdf';
import { generateDek, wrapDek, unwrapDek, generateCek, unwrapCek } from './keys';
import {
  generateRecoveryCode,
  normalizeRecoveryCode,
  isPlausibleRecoveryCode,
  deriveRecoveryKek,
  formatRecoveryCode,
} from './recovery';
import { generateKeyPair, sealFor, openSealed, CONTEXT } from './asymmetric';
import { randomBytes, toBase64Url, fromBase64Url, timingSafeEqual } from './bytes';

// Argon2id is deliberately slow; these tests derive real keys rather than
// mocking, because the point is to prove the real path works.
const SLOW = 30_000;

async function testKek(passphrase = 'correct horse battery staple') {
  return deriveKek(passphrase, newKdfParams());
}

describe('byte helpers', () => {
  it('round-trips base64url without padding or unsafe characters', () => {
    for (let length = 0; length < 64; length += 1) {
      const bytes = randomBytes(length);
      const encoded = toBase64Url(bytes);
      expect(encoded).not.toMatch(/[+/=]/);
      expect([...fromBase64Url(encoded)]).toEqual([...bytes]);
    }
  });

  it('compares equal and unequal buffers correctly', () => {
    const a = new Uint8Array([1, 2, 3]);
    expect(timingSafeEqual(a, new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(a, new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(a, new Uint8Array([1, 2]))).toBe(false);
  });
});

describe('sealed envelopes', () => {
  it('round-trips a secret value', async () => {
    const { key } = await generateDek();
    const envelope = await seal(key, '123-45-6789');
    expect(await open(key, envelope)).toBe('123-45-6789');
  });

  it('produces a different ciphertext each time for the same plaintext', async () => {
    const { key } = await generateDek();
    const a = await seal(key, 'same value');
    const b = await seal(key, 'same value');
    expect(a.ct).not.toBe(b.ct);
    expect(a.iv).not.toBe(b.iv);
  });

  it('never leaves the plaintext anywhere in the envelope', async () => {
    const { key } = await generateDek();
    const envelope = await seal(key, 'passport-X1234567');
    expect(JSON.stringify(envelope)).not.toContain('X1234567');
  });

  it('refuses a ciphertext sealed under a different key', async () => {
    const { key: a } = await generateDek();
    const { key: b } = await generateDek();
    const envelope = await seal(a, 'garage code 4417');
    await expect(open(b, envelope)).rejects.toThrow(EnvelopeError);
  });

  it('detects a tampered ciphertext', async () => {
    const { key } = await generateDek();
    const envelope = await seal(key, 'alarm code 9902');
    const bytes = fromBase64Url(envelope.ct);
    bytes[0] ^= 0xff;
    await expect(open(key, { ...envelope, ct: toBase64Url(bytes) })).rejects.toThrow(EnvelopeError);
  });

  it('rejects an envelope moved to a different field', async () => {
    const { key } = await generateDek();
    const aad = fieldContext('household_members', 'member-1', 'ssn');
    const envelope = await seal(key, '123-45-6789', aad);

    expect(await open(key, envelope)).toBe('123-45-6789');

    // Same key, same ciphertext, different record: must not decrypt.
    const moved = { ...envelope, aad: fieldContext('household_members', 'member-2', 'ssn') };
    await expect(open(key, moved)).rejects.toThrow(EnvelopeError);
  });

  it('rejects an unknown envelope version', async () => {
    const { key } = await generateDek();
    const envelope = await seal(key, 'value');
    await expect(open(key, { ...envelope, v: 99 })).rejects.toThrow(/version/i);
  });

  it('recognises malformed envelopes', () => {
    expect(isSealedEnvelope(null)).toBe(false);
    expect(isSealedEnvelope({ v: 1, alg: 'A256GCM' })).toBe(false);
    expect(isSealedEnvelope({ v: 1, alg: 'A256GCM', iv: 'a', ct: 'b' })).toBe(true);
  });

  it('round-trips raw bytes', async () => {
    const { key } = await generateDek();
    const payload = randomBytes(96);
    const envelope = await sealBytes(key, payload);
    expect([...(await openBytes(key, envelope))]).toEqual([...payload]);
  });
});

describe('passphrase derivation', () => {
  it('derives the same key from the same passphrase and salt', { timeout: SLOW }, async () => {
    const params = newKdfParams();
    const kek1 = await deriveKek('a shared family passphrase', params);
    const kek2 = await deriveKek('a shared family passphrase', params);

    // CryptoKeys cannot be compared directly, so compare what they can open.
    const envelope = await seal(kek1, 'probe');
    expect(await open(kek2, envelope)).toBe('probe');
  });

  it('derives a different key for a different salt', { timeout: SLOW }, async () => {
    const kek1 = await deriveKek('same passphrase', newKdfParams());
    const kek2 = await deriveKek('same passphrase', newKdfParams());
    const envelope = await seal(kek1, 'probe');
    await expect(open(kek2, envelope)).rejects.toThrow(EnvelopeError);
  });

  it('normalizes unicode so an accented passphrase is stable', { timeout: SLOW }, async () => {
    // The same passphrase as two keyboards produce it: one composes the e-acute
    // into a single code point, the other leaves a bare e plus a combining accent.
    const composed = 'café famille';
    const decomposed = 'café famille';
    expect(composed).not.toBe(decomposed);

    const params = newKdfParams();
    const kek1 = await deriveKek(composed, params);
    const kek2 = await deriveKek(decomposed, params);

    const envelope = await seal(kek1, 'probe');
    expect(await open(kek2, envelope)).toBe('probe');
  });

  it('scores passphrase strength without hard-failing anything', () => {
    expect(passphraseStrength('abc').score).toBe(0);
    expect(passphraseStrength('password1234').score).toBeGreaterThanOrEqual(2);
    expect(passphraseStrength('correct horse battery staple').score).toBe(4);
  });
});

describe('key hierarchy', () => {
  it('wraps and unwraps the family data key', { timeout: SLOW }, async () => {
    const kek = await testKek();
    const { raw } = await generateDek();
    const wrapped = await wrapDek(kek, raw, 'passphrase');

    const { key: dek } = await unwrapDek(kek, wrapped);
    const envelope = await seal(dek, 'policy 88-2214');
    expect(await open(dek, envelope)).toBe('policy 88-2214');
  });

  it('refuses to unwrap with the wrong passphrase', { timeout: SLOW }, async () => {
    const params = newKdfParams();
    const right = await deriveKek('the real passphrase', params);
    const wrong = await deriveKek('a guess', params);

    const { raw } = await generateDek();
    const wrapped = await wrapDek(right, raw, 'passphrase');

    await expect(unwrapDek(wrong, wrapped)).rejects.toThrow(EnvelopeError);
  });

  it('withholds raw key bytes unless explicitly asked', { timeout: SLOW }, async () => {
    const kek = await testKek();
    const { raw } = await generateDek();
    const wrapped = await wrapDek(kek, raw, 'passphrase');

    const normal = await unwrapDek(kek, wrapped);
    expect(normal.raw).toBeUndefined();
    expect(normal.key.extractable).toBe(false);

    const forKeyManagement = await unwrapDek(kek, wrapped, { extractable: true });
    expect(forKeyManagement.raw).toBeDefined();
    expect([...forKeyManagement.raw!]).toEqual([...raw]);
  });

  it('gives each record its own content key', { timeout: SLOW }, async () => {
    const { key: dek } = await generateDek();

    const first = await generateCek(dek);
    const second = await generateCek(dek);

    const envelope = await seal(first.key, "mom's SSN");
    expect(await open(first.key, envelope)).toBe("mom's SSN");

    // One record's key must not open another record's data.
    await expect(open(second.key, envelope)).rejects.toThrow(EnvelopeError);
  });

  it('unwraps a content key from the family key', { timeout: SLOW }, async () => {
    const { key: dek } = await generateDek();
    const { key: cek, wrapped } = await generateCek(dek);

    const envelope = await seal(cek, 'VIN 1HGCM82633A004352');
    const { key: reopened } = await unwrapCek(dek, wrapped);
    expect(await open(reopened, envelope)).toBe('VIN 1HGCM82633A004352');
  });
});

describe('recovery codes', () => {
  it('generates a code in the printable grouped form', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^FGK1(-[0-9A-HJKMNP-TV-Z]{5}){10}$/);
    expect(isPlausibleRecoveryCode(code)).toBe(true);
  });

  it('generates a different code every time', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(50);
  });

  it('forgives how someone types it off a printed sheet', () => {
    const code = generateRecoveryCode();
    const canonical = normalizeRecoveryCode(code);

    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(canonical);
    expect(normalizeRecoveryCode(code.replace(/-/g, ''))).toBe(canonical);
    expect(normalizeRecoveryCode(code.replace(/-/g, ' '))).toBe(canonical);
    // The classic misreadings: O for zero, I or L for one.
    expect(normalizeRecoveryCode(canonical.replace(/0/g, 'O'))).toBe(canonical);
    expect(normalizeRecoveryCode(canonical.replace(/1/g, 'l'))).toBe(canonical);
  });

  it('rejects codes of the wrong shape', () => {
    expect(isPlausibleRecoveryCode('FGK1-ABC')).toBe(false);
    expect(isPlausibleRecoveryCode('')).toBe(false);
  });

  it('reformats a normalized body back to printable form', () => {
    const code = generateRecoveryCode();
    expect(formatRecoveryCode(normalizeRecoveryCode(code))).toBe(code);
  });

  it('recovers the data key when the passphrase is forgotten', { timeout: SLOW }, async () => {
    const { raw } = await generateDek();

    // Signup: wrap the DEK under both the passphrase and the recovery code.
    const passphraseKek = await deriveKek('forgotten by next spring', newKdfParams());
    const recoveryCode = generateRecoveryCode();
    const recoverySalt = randomBytes(16);
    const recoveryKek = await deriveRecoveryKek(recoveryCode, recoverySalt);

    await wrapDek(passphraseKek, raw, 'passphrase');
    const byRecovery = await wrapDek(recoveryKek, raw, 'recovery-code');

    // A year later, only the printed sheet survives.
    const rederived = await deriveRecoveryKek(recoveryCode, recoverySalt);
    const { key: dek } = await unwrapDek(rederived, byRecovery);

    const envelope = await seal(dek, 'safe combination 12-34-56');
    expect(await open(dek, envelope)).toBe('safe combination 12-34-56');
  });

  it('accepts a sloppily typed recovery code', { timeout: SLOW }, async () => {
    const { raw } = await generateDek();
    const code = generateRecoveryCode();
    const salt = randomBytes(16);

    const wrapped = await wrapDek(await deriveRecoveryKek(code, salt), raw, 'recovery-code');

    const asTyped = ` ${code.toLowerCase().replace(/-/g, ' ')} `;
    const { key: dek } = await unwrapDek(await deriveRecoveryKek(asTyped, salt), wrapped);
    expect(await open(dek, await seal(dek, 'ok'))).toBe('ok');
  });

  it('rejects a wrong recovery code', { timeout: SLOW }, async () => {
    const { raw } = await generateDek();
    const salt = randomBytes(16);
    const wrapped = await wrapDek(
      await deriveRecoveryKek(generateRecoveryCode(), salt),
      raw,
      'recovery-code',
    );

    const wrong = await deriveRecoveryKek(generateRecoveryCode(), salt);
    await expect(unwrapDek(wrong, wrapped)).rejects.toThrow(EnvelopeError);
  });
});

describe('inviting a family member', () => {
  it('hands the data key to a new member without a shared secret', { timeout: SLOW }, async () => {
    const familyId = 'family-abc';

    // The new member generates a keypair when they accept the invite link.
    const member = generateKeyPair();

    // The inviter, who is unlocked, re-wraps the DEK for that public key.
    const { raw: dekRaw } = await generateDek();
    const box = await sealFor(member.publicKey, dekRaw, CONTEXT.memberInvite(familyId));

    // The new member opens it with their private key.
    const received = await openSealed(member.privateKey, box, CONTEXT.memberInvite(familyId));
    expect([...received]).toEqual([...dekRaw]);
  });

  it('will not open an invite meant for a different family', { timeout: SLOW }, async () => {
    const member = generateKeyPair();
    const { raw } = await generateDek();
    const box = await sealFor(member.publicKey, raw, CONTEXT.memberInvite('family-abc'));

    await expect(
      openSealed(member.privateKey, box, CONTEXT.memberInvite('family-xyz')),
    ).rejects.toThrow(EnvelopeError);
  });

  it('will not open with the wrong private key', { timeout: SLOW }, async () => {
    const member = generateKeyPair();
    const stranger = generateKeyPair();
    const { raw } = await generateDek();
    const box = await sealFor(member.publicKey, raw, CONTEXT.memberInvite('family-abc'));

    await expect(
      openSealed(stranger.privateKey, box, CONTEXT.memberInvite('family-abc')),
    ).rejects.toThrow(EnvelopeError);
  });
});

describe('sharing one record with another family', () => {
  it('shares a single record without exposing the data key', { timeout: SLOW }, async () => {
    const shareId = 'share-1';

    // Family A has a record sealed under its own content key.
    const { key: dekA } = await generateDek();
    const { key: cek, wrapped } = await generateCek(dekA);
    const record = await seal(cek, 'Dad — Medicare 1EG4-TE5-MK73');

    // Family B publishes a public key.
    const familyB = generateKeyPair();

    // A re-wraps only that record's content key for B.
    const { raw: cekRaw } = await unwrapCek(dekA, wrapped, { extractable: true });
    const box = await sealFor(familyB.publicKey, cekRaw!, CONTEXT.recordShare(shareId));

    // B opens the content key and reads exactly that one record.
    const receivedCek = await openSealed(familyB.privateKey, box, CONTEXT.recordShare(shareId));
    const importedCek = await crypto.subtle.importKey(
      'raw',
      receivedCek,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    expect(await open(importedCek, record)).toBe('Dad — Medicare 1EG4-TE5-MK73');

    // And nothing else: a second record under the same DEK stays closed.
    const other = await generateCek(dekA);
    const otherRecord = await seal(other.key, 'Mom — SSN 123-45-6789');
    await expect(open(importedCek, otherRecord)).rejects.toThrow(EnvelopeError);
  });
});

describe('what reaches the server', () => {
  it('leaves no plaintext in the row a service-role query would return', { timeout: SLOW }, async () => {
    const secrets = {
      ssn: '123-45-6789',
      passport: 'X1234567',
      garageCode: '4417',
      wifiPassword: 'PurpleOtter!2024',
      accountNumber: '000123456789',
    };

    const kek = await testKek();
    const { raw: dekRaw } = await generateDek();
    const wrappedDek = await wrapDek(kek, dekRaw, 'passphrase');
    const { key: dek } = await unwrapDek(kek, wrappedDek);
    const { key: cek, wrapped: wrappedCek } = await generateCek(dek);

    // The row exactly as it would be inserted: plaintext tier-0 columns, sealed
    // tier-1 columns, and the wrapped keys.
    const row = {
      id: 'member-1',
      family_id: 'family-1',
      display_name: 'Dana Whitfield',
      date_of_birth: '1979-04-02',
      last_verified_at: '2026-07-31',
      ssn: await seal(cek, secrets.ssn, fieldContext('household_members', 'member-1', 'ssn')),
      passport_number: await seal(cek, secrets.passport),
      wrapped_cek: wrappedCek,
      wrapped_dek: wrappedDek,
    };

    const asStored = JSON.stringify(row);
    for (const secret of Object.values(secrets)) {
      expect(asStored).not.toContain(secret);
    }

    // Tier-0 fields stay readable, which is what makes lists and reminders work.
    expect(asStored).toContain('Dana Whitfield');
    expect(asStored).toContain('1979-04-02');

    // And the client can still read the secrets back.
    expect(
      await open(cek, row.ssn),
    ).toBe(secrets.ssn);
  });
});
