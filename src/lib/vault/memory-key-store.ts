/**
 * An in-memory KeyStore for tests.
 *
 * Deliberately faithful about the things that have bitten real implementations:
 * it hands back copies rather than live references, so a test cannot pass by
 * mutating a stored object, and it round-trips everything through JSON, so a
 * value that would not survive Postgres does not survive here either.
 */

import type { IdentityRecord, WrappingRecord } from '@/lib/crypto/engine';
import type { FamilySummary, KeyStore, StoredWrapping } from './key-store';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryKeyStore implements KeyStore {
  private families: FamilySummary[] = [];
  private wrappings = new Map<string, StoredWrapping[]>();
  private identity: IdentityRecord | null = null;
  private nextId = 1;

  /** Every write, in order. Lets a test assert on what actually left the client. */
  readonly writes: { operation: string; payload: unknown }[] = [];

  private record(operation: string, payload: unknown) {
    this.writes.push({ operation, payload: clone(payload) });
  }

  async loadFamilies(): Promise<FamilySummary[]> {
    return clone(this.families);
  }

  async createFamily(name: string): Promise<FamilySummary> {
    const family = { id: `family-${this.nextId++}`, name };
    this.families.push(family);
    this.record('createFamily', family);
    return clone(family);
  }

  async loadWrappings(familyId: string): Promise<StoredWrapping[]> {
    return clone(this.wrappings.get(familyId) ?? []);
  }

  async saveWrappings(familyId: string, wrappings: WrappingRecord[]): Promise<StoredWrapping[]> {
    const stored = wrappings.map((wrapping) => ({
      ...clone(wrapping),
      id: `wrapping-${this.nextId++}`,
    }));

    this.wrappings.set(familyId, [...(this.wrappings.get(familyId) ?? []), ...stored]);
    this.record('saveWrappings', { familyId, wrappings });
    return clone(stored);
  }

  async replaceWrapping(id: string, wrapping: WrappingRecord): Promise<void> {
    for (const [familyId, list] of this.wrappings) {
      const index = list.findIndex((candidate) => candidate.id === id);
      if (index === -1) continue;
      list[index] = { ...clone(wrapping), id };
      this.wrappings.set(familyId, list);
      this.record('replaceWrapping', { id, wrapping });
      return;
    }
    throw new Error(`No wrapping with id ${id}`);
  }

  async markUsed(id: string): Promise<void> {
    this.record('markUsed', { id });
  }

  async loadIdentity(): Promise<IdentityRecord | null> {
    return this.identity ? clone(this.identity) : null;
  }

  async saveIdentity(identity: IdentityRecord): Promise<void> {
    this.identity = clone(identity);
    this.record('saveIdentity', identity);
  }

  /** Everything this store was ever asked to persist, as one JSON string. */
  everythingWritten(): string {
    return JSON.stringify(this.writes);
  }
}
