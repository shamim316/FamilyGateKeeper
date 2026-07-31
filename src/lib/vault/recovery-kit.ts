/**
 * The recovery kit: the one screen in this app where friction is the feature.
 *
 * Losing both the passphrase and this code means the data is gone, with no
 * reset and no support ticket that can help. A checkbox alone gets ticked
 * without reading, so the ceremony also asks the user to type one group back —
 * about twenty seconds, in exchange for the worst outcome this product has.
 */

import { normalizeRecoveryCode, RECOVERY_CODE_PREFIX } from '@/lib/crypto/recovery';

const GROUP_SIZE = 5;

/** Splits a code into its printed groups, without the FGK1 prefix. */
export function recoveryCodeGroups(code: string): string[] {
  const body = normalizeRecoveryCode(code);
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += GROUP_SIZE) {
    groups.push(body.slice(i, i + GROUP_SIZE));
  }
  return groups;
}

/**
 * Picks which group to ask for. Random so that someone setting up a second
 * vault cannot learn to skim, and never the first — that one is glanced at
 * while reading the code and proves the least.
 */
export function chooseChallengeIndex(
  groupCount: number,
  random: () => number = Math.random,
): number {
  if (groupCount <= 1) return 0;
  return 1 + Math.floor(random() * (groupCount - 1));
}

/**
 * Checks a typed group against the real one, with the same forgiveness the
 * unlock path has: case, spacing, and the O-for-zero and I-for-one misreadings
 * someone makes copying from a printed sheet.
 */
export function isChallengeAnswerCorrect(
  code: string,
  groupIndex: number,
  answer: string,
): boolean {
  const groups = recoveryCodeGroups(code);
  const expected = groups[groupIndex];
  if (!expected) return false;

  const given = normalizeRecoveryCode(answer);
  return given.length > 0 && given === expected;
}

/** The text of the printable and downloadable kit. */
export function recoveryKitText(options: {
  code: string;
  familyName: string;
  createdOn: Date;
}): string {
  const date = options.createdOn.toISOString().slice(0, 10);

  return [
    'FAMILY GATE KEEPER — RECOVERY CODE',
    '',
    `Family:  ${options.familyName}`,
    `Created: ${date}`,
    '',
    options.code,
    '',
    'WHAT THIS IS',
    'This code can unlock your vault if you forget your passphrase.',
    'It is the only other way in.',
    '',
    'IF YOU LOSE BOTH THIS CODE AND YOUR PASSPHRASE, YOUR DATA IS GONE.',
    'Nobody can recover it — not us, not anyone. Your information is',
    'encrypted on your own device, and we only ever store scrambled text',
    'we cannot read.',
    '',
    'WHERE TO PUT THIS',
    'Somewhere physical and safe: a filing cabinet, a home safe, or with',
    'your will. Not in your email, and not in a note on the same phone you',
    'unlock the vault with.',
    '',
    'Anyone holding this piece of paper can open your vault. Treat it the',
    'way you would treat a spare key to your house.',
  ].join('\n');
}

export function recoveryKitFilename(familyName: string, createdOn: Date): string {
  const safeName = familyName.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'family';
  return `gate-keeper-recovery-${safeName.toLowerCase()}-${createdOn.toISOString().slice(0, 10)}.txt`;
}

export { RECOVERY_CODE_PREFIX };
