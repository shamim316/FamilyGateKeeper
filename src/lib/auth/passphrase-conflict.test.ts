import { afterEach, describe, expect, it } from 'vitest';
import * as module from './passphrase-conflict';
import {
  canCheckAgainstAccountPassword,
  forgetAccountPassword,
  isAccountPassword,
  rememberAccountPassword,
} from './passphrase-conflict';

afterEach(() => {
  forgetAccountPassword();
});

describe('refusing to reuse the sign-in password', () => {
  it('spots the passphrase being the account password', () => {
    rememberAccountPassword('correct horse battery staple');
    expect(isAccountPassword('correct horse battery staple')).toBe(true);
  });

  it('allows anything else', () => {
    rememberAccountPassword('correct horse battery staple');
    expect(isAccountPassword('a completely different passphrase')).toBe(false);
    // A near miss is still a different secret.
    expect(isAccountPassword('correct horse battery stapl')).toBe(false);
  });

  it('is case and whitespace sensitive, because the secrets are', () => {
    rememberAccountPassword('Correct Horse');
    expect(isAccountPassword('correct horse')).toBe(false);
    expect(isAccountPassword(' Correct Horse')).toBe(false);
  });

  it('normalizes unicode the way the key derivation does', () => {
    // The same passphrase from two keyboards: composed é versus e + accent.
    // Written as escapes so the file's own encoding cannot quietly make these
    // two identical and turn the test into a tautology.
    // Argon2id normalizes before hashing, so this comparison must too, or a
    // reused password would slip through on one of the two devices.
    const composed = 'caf\u00E9 famille';
    const decomposed = 'cafe\u0301 famille';
    expect(composed).not.toBe(decomposed);

    rememberAccountPassword(composed);
    expect(isAccountPassword(decomposed)).toBe(true);
  });
});

describe('when there is nothing to compare against', () => {
  it('permits rather than blocks', () => {
    // A returning member finishing setup in a later session never typed their
    // password here. Refusing everything would be worse than trusting them.
    expect(isAccountPassword('anything at all')).toBe(false);
    expect(canCheckAgainstAccountPassword()).toBe(false);
  });

  it('says whether a comparison is even possible, so the UI can be honest', () => {
    expect(canCheckAgainstAccountPassword()).toBe(false);
    rememberAccountPassword('something');
    expect(canCheckAgainstAccountPassword()).toBe(true);
  });

  it('treats an empty passphrase as no match', () => {
    rememberAccountPassword('something');
    expect(isAccountPassword('')).toBe(false);
  });
});

describe('not keeping the password around', () => {
  it('forgets on request', () => {
    rememberAccountPassword('correct horse battery staple');
    forgetAccountPassword();

    expect(canCheckAgainstAccountPassword()).toBe(false);
    expect(isAccountPassword('correct horse battery staple')).toBe(false);
  });

  it('never exposes the password itself', () => {
    rememberAccountPassword('correct horse battery staple');

    // Only a digest is held. Anything that could hand the password back would
    // make this module a worse place to keep it than not keeping it at all.
    const surface = Object.keys(module);
    expect(surface.sort()).toEqual(
      [
        'canCheckAgainstAccountPassword',
        'forgetAccountPassword',
        'isAccountPassword',
        'rememberAccountPassword',
      ].sort(),
    );
  });
});
