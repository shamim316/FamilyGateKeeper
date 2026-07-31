/**
 * Family Gate Keeper client-side encryption.
 *
 * Every secret value in the app passes through this module and nowhere else.
 * See ./README.md for the threat model and key hierarchy.
 */

export {
  seal,
  open,
  sealBytes,
  openBytes,
  isSealedEnvelope,
  fieldContext,
  EnvelopeError,
  ENVELOPE_VERSION,
  type SealedEnvelope,
} from './envelope';

export {
  deriveKek,
  newKdfParams,
  passphraseStrength,
  DEFAULT_KDF_PARAMS,
  type KdfParams,
} from './kdf';

export {
  generateDek,
  wrapDek,
  unwrapDek,
  generateCek,
  unwrapCek,
  addDekWrapping,
  type WrappedKey,
} from './keys';

export {
  generateRecoveryCode,
  normalizeRecoveryCode,
  isPlausibleRecoveryCode,
  deriveRecoveryKek,
  formatRecoveryCode,
  RECOVERY_CODE_PREFIX,
} from './recovery';

export {
  generateKeyPair,
  sealFor,
  openSealed,
  CONTEXT,
  type KeyPairMaterial,
  type SealedBox,
} from './asymmetric';

export {
  toBase64Url,
  fromBase64Url,
  randomBytes,
  timingSafeEqual,
  wipe,
} from './bytes';
