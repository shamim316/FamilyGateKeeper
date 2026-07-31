'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CryptoEngine } from '@/lib/crypto/engine';
import { workerEngine, terminateCryptoWorker } from '@/lib/crypto/worker-engine';
import { createClient } from '@/lib/supabase/client';
import { SupabaseKeyStore } from './supabase-key-store';
import type { KeyStore } from './key-store';
import {
  readVaultStatus,
  setUpVault,
  unlockVault,
  recoverVault,
  type SetUpResult,
  type VaultStatus,
} from './ceremony';
import {
  VaultSession,
  createLockChannel,
  type LockReason,
  type VaultState,
} from './session';

interface VaultContextValue {
  /** Locked, unlocking, or unlocked — and the key, when there is one. */
  state: VaultState;
  /** Whether this account has a family and keys yet. Null until first loaded. */
  status: VaultStatus | null;
  loadingStatus: boolean;

  refreshStatus: () => Promise<VaultStatus>;
  setUp: (familyName: string, passphrase: string) => Promise<SetUpResult>;
  unlock: (passphrase: string) => Promise<void>;
  recover: (recoveryCode: string, newPassphrase: string) => Promise<void>;
  lock: (reason?: LockReason) => void;

  store: KeyStore;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export interface VaultProviderProps {
  children: React.ReactNode;
  /** Overridden in tests; production uses the worker and Supabase. */
  engine?: CryptoEngine;
  store?: KeyStore;
  idleTimeoutMs?: number;
}

export function VaultProvider({ children, engine, store, idleTimeoutMs }: VaultProviderProps) {
  const resolvedEngine = useMemo(() => engine ?? workerEngine, [engine]);
  const resolvedStore = useMemo(
    () => store ?? new SupabaseKeyStore(() => createClient()),
    [store],
  );

  const sessionRef = useRef<VaultSession | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = new VaultSession({
      idleTimeoutMs,
      channel: createLockChannel(),
    });
  }
  const session = sessionRef.current;

  const [state, setState] = useState<VaultState>(session.getState());
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => session.subscribe(setState), [session]);

  // Tear the worker down whenever the vault locks. It holds no key material
  // between calls, but a locked vault should not leave a thread idling with a
  // module full of key-handling code loaded.
  useEffect(() => {
    if (state.status === 'locked') terminateCryptoWorker();
  }, [state.status]);

  useEffect(() => () => session.dispose(), [session]);

  // Anything the user does counts as activity. These are passive listeners on
  // the whole document, so they must stay cheap — noteActivity is a timestamp
  // assignment and nothing more.
  useEffect(() => {
    if (state.status !== 'unlocked') return;

    const note = () => session.noteActivity();
    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'scroll', 'focus'];
    for (const event of events) {
      document.addEventListener(event, note, { passive: true, capture: true });
    }
    return () => {
      for (const event of events) {
        document.removeEventListener(event, note, { capture: true });
      }
    };
  }, [session, state.status]);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const next = await readVaultStatus(resolvedStore);
      setStatus(next);
      return next;
    } finally {
      setLoadingStatus(false);
    }
  }, [resolvedStore]);

  useEffect(() => {
    void refreshStatus().catch(() => {
      // Signed out, offline, or a policy said no. The screens handle a null
      // status by sending the user back to sign in.
      setStatus(null);
    });
  }, [refreshStatus]);

  const setUp = useCallback(
    async (familyName: string, passphrase: string) => {
      session.beginUnlocking();
      try {
        const existing = status?.state === 'keys-missing' ? status.family : undefined;
        const result = await setUpVault(resolvedEngine, resolvedStore, {
          familyName,
          passphrase,
          existingFamily: existing,
        });
        session.unlocked(result.dek, result.family.id);
        await refreshStatus();
        return result;
      } catch (error) {
        session.lock('manual');
        throw error;
      }
    },
    [refreshStatus, resolvedEngine, resolvedStore, session, status],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      const current = status ?? (await refreshStatus());
      if (current.state !== 'locked') {
        throw new Error('This vault is not ready to be unlocked yet');
      }

      session.beginUnlocking();
      try {
        const dek = await unlockVault(resolvedEngine, resolvedStore, {
          wrapping: current.wrapping,
          passphrase,
        });
        session.unlocked(dek, current.family.id);
      } catch (error) {
        // Back to locked with no reason banner: the user is looking at the
        // error message on the form, and a second explanation is noise.
        session.lock('manual');
        throw error;
      }
    },
    [refreshStatus, resolvedEngine, resolvedStore, session, status],
  );

  const recover = useCallback(
    async (recoveryCode: string, newPassphrase: string) => {
      const current = status ?? (await refreshStatus());
      if (current.state === 'family-missing') {
        throw new Error('There is no vault on this account to recover');
      }

      session.beginUnlocking();
      try {
        const dek = await recoverVault(resolvedEngine, resolvedStore, {
          familyId: current.family.id,
          recoveryCode,
          newPassphrase,
        });
        session.unlocked(dek, current.family.id);
        await refreshStatus();
      } catch (error) {
        session.lock('manual');
        throw error;
      }
    },
    [refreshStatus, resolvedEngine, resolvedStore, session, status],
  );

  const lock = useCallback((reason: LockReason = 'manual') => session.lock(reason), [session]);

  const value = useMemo<VaultContextValue>(
    () => ({
      state,
      status,
      loadingStatus,
      refreshStatus,
      setUp,
      unlock,
      recover,
      lock,
      store: resolvedStore,
    }),
    [state, status, loadingStatus, refreshStatus, setUp, unlock, recover, lock, resolvedStore],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used inside a VaultProvider');
  }
  return context;
}

/** The data key, or null when locked. Screens that need it should redirect on null. */
export function useDataKey(): CryptoKey | null {
  const { state } = useVault();
  return state.status === 'unlocked' ? state.dek : null;
}
