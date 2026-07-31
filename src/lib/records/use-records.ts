'use client';

/**
 * React access to records.
 *
 * The repository needs an unlocked data key, so these hooks return a loading
 * state until the vault is open. Screens redirect on a locked vault rather than
 * rendering half a record.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useVault } from '@/lib/vault/vault-provider';
import { createClient } from '@/lib/supabase/client';
import { SupabaseRecordGateway } from './supabase-gateway';
import { RecordRepository, emptyValues, type LoadedRecord, type RecordSummary } from './repository';
import type { FormValues, RecordDefinition } from './definition';
import type { RecordGateway } from './gateway';

/**
 * Overridable so tests can drive the real screens against an in-memory
 * gateway, the same way the vault screens are tested.
 */
let gatewayFactory: () => RecordGateway = () => new SupabaseRecordGateway(() => createClient());

export function setRecordGatewayFactory(factory: () => RecordGateway): void {
  gatewayFactory = factory;
}

export function useRepository(): RecordRepository | null {
  const { state } = useVault();
  return useMemo(() => {
    if (state.status !== 'unlocked') return null;
    return new RecordRepository(gatewayFactory(), state.dek);
  }, [state]);
}

export function useRecordList(definition: RecordDefinition) {
  const { state } = useVault();
  const repository = useRepository();
  const familyId = state.status === 'unlocked' ? state.familyId : null;

  const [records, setRecords] = useState<RecordSummary[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    if (!repository || !familyId) return;
    try {
      setRecords(await repository.list(definition, familyId));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError : new Error(String(loadError)));
    }
  }, [definition, familyId, repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { records, error, reload, loading: records === null && error === null };
}

export function useRecord(definition: RecordDefinition, id: string) {
  const repository = useRepository();

  const [record, setRecord] = useState<LoadedRecord | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!repository) return;

    void (async () => {
      try {
        const loaded = await repository.load(definition, id);
        if (cancelled) return;
        if (!loaded) {
          setMissing(true);
          return;
        }
        setRecord(loaded);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError : new Error(String(loadError)));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [definition, id, repository]);

  const save = useCallback(
    async (patch: FormValues) => {
      if (!repository || !record) throw new Error('This record is not open');
      await repository.update(definition, record.id, record.cek, patch);
    },
    [definition, record, repository],
  );

  const remove = useCallback(async () => {
    if (!repository) throw new Error('Your vault is locked');
    await repository.remove(definition, id);
  }, [definition, id, repository]);

  return {
    record,
    error,
    missing,
    save,
    remove,
    loading: record === null && error === null && !missing,
  };
}

export function useCreateRecord(definition: RecordDefinition) {
  const { state } = useVault();
  const repository = useRepository();
  const familyId = state.status === 'unlocked' ? state.familyId : null;

  return useCallback(
    async (values: FormValues = {}) => {
      if (!repository || !familyId) throw new Error('Your vault is locked');
      return repository.create(definition, familyId, {
        ...emptyValues(definition),
        ...values,
      });
    },
    [definition, familyId, repository],
  );
}
