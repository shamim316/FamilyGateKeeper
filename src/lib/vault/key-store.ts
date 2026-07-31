/**
 * Where wrapped keys and family membership are read and written.
 *
 * This exists as an interface so the ceremonies in ./ceremony.ts can be tested
 * against an in-memory implementation. That is not a hypothetical convenience:
 * the ceremonies are the riskiest logic in the product — get one wrong and a
 * family is locked out of their own records permanently — and they need to be
 * verifiable without a network, a live Supabase project, or a mailbox.
 *
 * Everything crossing this boundary is ciphertext or public material. A store
 * implementation that logged every argument it received would leak nothing.
 */

import type { IdentityRecord, WrappingRecord } from '@/lib/crypto/engine';

export interface StoredWrapping extends WrappingRecord {
  id: string;
}

export interface FamilySummary {
  id: string;
  name: string;
}

export interface KeyStore {
  /** Families the signed-in user belongs to. Row-level security does the filtering. */
  loadFamilies(): Promise<FamilySummary[]>;

  createFamily(name: string): Promise<FamilySummary>;

  /** This user's wrapped copies of one family's data key. Never another member's. */
  loadWrappings(familyId: string): Promise<StoredWrapping[]>;

  saveWrappings(familyId: string, wrappings: WrappingRecord[]): Promise<StoredWrapping[]>;

  /** Used when a passphrase changes: the data key is unchanged, only its wrapping. */
  replaceWrapping(id: string, wrapping: WrappingRecord): Promise<void>;

  /** Stamps last_used_at, which drives the device list in security settings. */
  markUsed(id: string): Promise<void>;

  loadIdentity(): Promise<IdentityRecord | null>;

  saveIdentity(identity: IdentityRecord): Promise<void>;
}

export class KeyStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KeyStoreError';
  }
}
