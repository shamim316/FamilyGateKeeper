/**
 * Passphrase strength scoring.
 *
 * Lives apart from ./kdf so the sign-up form can show a strength meter without
 * pulling Argon2id into the page bundle — the derivation itself belongs in the
 * worker, and nothing on the main thread should be importing it.
 *
 * Deliberately a score rather than a gate. A hard rule produces a passphrase on
 * a sticky note, which is worse than a mediocre one someone actually remembers;
 * the screens enforce only a length floor.
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
