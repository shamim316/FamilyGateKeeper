/**
 * The production KeyStore, backed by Supabase.
 *
 * Every query here relies on row-level security rather than filtering by hand:
 * `loadWrappings` does not pass a user id because the policy on
 * member_key_wrappings already restricts it to `user_id = auth.uid()`, and
 * `loadFamilies` does not join membership because the policy on families
 * already does. Adding a redundant client-side filter would hide a broken
 * policy rather than expose it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IdentityRecord, KdfSettings, WrappingRecord } from '@/lib/crypto/engine';
import type { SealedEnvelope } from '@/lib/crypto';
import { KeyStoreError, type FamilySummary, type KeyStore, type StoredWrapping } from './key-store';

interface WrappingRow {
  id: string;
  via: StoredWrapping['via'];
  wrapped_dek: SealedEnvelope;
  kdf_params: KdfSettings | null;
  salt: string | null;
  label: string | null;
}

function toStoredWrapping(row: WrappingRow): StoredWrapping {
  return {
    id: row.id,
    via: row.via,
    wrappedDek: row.wrapped_dek,
    kdfParams: row.kdf_params,
    salt: row.salt,
    label: row.label,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export class SupabaseKeyStore implements KeyStore {
  private client: Client | null = null;

  /**
   * Takes a factory rather than a client because this is constructed while
   * rendering, including during the build's prerender pass, where no Supabase
   * configuration exists. Creating a key store should not require a network to
   * be reachable — only using one should.
   */
  constructor(private readonly createSupabaseClient: () => Client) {}

  private get supabase(): Client {
    this.client ??= this.createSupabaseClient();
    return this.client;
  }

  private async requireUserId(): Promise<string> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) {
      throw new KeyStoreError('You are not signed in', { cause: error });
    }
    return data.user.id;
  }

  async loadFamilies(): Promise<FamilySummary[]> {
    const { data, error } = await this.supabase
      .from('families')
      .select('id, name')
      .order('created_at', { ascending: true });

    if (error) throw new KeyStoreError('Could not load your family', { cause: error });
    return (data ?? []) as FamilySummary[];
  }

  async createFamily(name: string): Promise<FamilySummary> {
    // The families_claim_owner trigger adds the creator as an active owner, so
    // there is no second insert to keep in sync here.
    const { data, error } = await this.supabase
      .from('families')
      .insert({ name })
      .select('id, name')
      .single();

    if (error || !data) {
      throw new KeyStoreError('Could not create your family', { cause: error });
    }
    return data as FamilySummary;
  }

  async loadWrappings(familyId: string): Promise<StoredWrapping[]> {
    const { data, error } = await this.supabase
      .from('member_key_wrappings')
      .select('id, via, wrapped_dek, kdf_params, salt, label')
      .eq('family_id', familyId);

    if (error) throw new KeyStoreError('Could not load your keys', { cause: error });
    return ((data ?? []) as WrappingRow[]).map(toStoredWrapping);
  }

  async saveWrappings(familyId: string, wrappings: WrappingRecord[]): Promise<StoredWrapping[]> {
    const userId = await this.requireUserId();

    const { data, error } = await this.supabase
      .from('member_key_wrappings')
      .insert(
        wrappings.map((wrapping) => ({
          family_id: familyId,
          user_id: userId,
          via: wrapping.via,
          wrapped_dek: wrapping.wrappedDek,
          kdf_params: wrapping.kdfParams,
          salt: wrapping.salt,
          label: wrapping.label ?? null,
        })),
      )
      .select('id, via, wrapped_dek, kdf_params, salt, label');

    if (error || !data) {
      throw new KeyStoreError('Could not save your keys', { cause: error });
    }
    return (data as WrappingRow[]).map(toStoredWrapping);
  }

  async replaceWrapping(id: string, wrapping: WrappingRecord): Promise<void> {
    const { error } = await this.supabase
      .from('member_key_wrappings')
      .update({
        via: wrapping.via,
        wrapped_dek: wrapping.wrappedDek,
        kdf_params: wrapping.kdfParams,
        salt: wrapping.salt,
        label: wrapping.label ?? null,
      })
      .eq('id', id);

    if (error) throw new KeyStoreError('Could not update your passphrase', { cause: error });
  }

  async markUsed(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('member_key_wrappings')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new KeyStoreError('Could not record the unlock', { cause: error });
  }

  async loadIdentity(): Promise<IdentityRecord | null> {
    const userId = await this.requireUserId();

    const { data, error } = await this.supabase
      .from('user_identities')
      .select('public_key, wrapped_private_key')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new KeyStoreError('Could not load your identity key', { cause: error });
    if (!data) return null;

    const row = data as { public_key: string; wrapped_private_key: SealedEnvelope };
    return { publicKey: row.public_key, wrappedPrivateKey: row.wrapped_private_key };
  }

  async saveIdentity(identity: IdentityRecord): Promise<void> {
    const userId = await this.requireUserId();

    const { error } = await this.supabase.from('user_identities').upsert(
      {
        user_id: userId,
        public_key: identity.publicKey,
        wrapped_private_key: identity.wrappedPrivateKey,
      },
      { onConflict: 'user_id' },
    );

    if (error) throw new KeyStoreError('Could not save your identity key', { cause: error });
  }
}
