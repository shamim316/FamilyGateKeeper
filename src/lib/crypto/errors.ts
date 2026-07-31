/**
 * Error types, kept in a module of their own with no dependencies.
 *
 * This is not tidiness for its own sake. The worker client needs these classes
 * to rebuild errors that crossed a postMessage boundary, and importing them
 * from ./engine would drag Argon2id and the rest of the key ceremony into the
 * main-thread bundle — defeating the code splitting that putting the engine in
 * a worker exists to achieve.
 */

export class VaultKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultKeyError';
  }
}
