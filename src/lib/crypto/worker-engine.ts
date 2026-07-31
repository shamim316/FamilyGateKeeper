/**
 * A CryptoEngine backed by the worker in ./worker.ts.
 *
 * The worker is created lazily on first use and then kept, because spinning one
 * up costs a module fetch and parse that would otherwise land in the middle of
 * the unlock the user is waiting on.
 */

import { EnvelopeError } from './envelope';
import { VaultKeyError } from './errors';
import type { CryptoEngine, WrappingRecord } from './engine';
import type { CryptoRequest, CryptoResponse } from './worker-protocol';

type Pending = {
  resolve: (value: never) => void;
  reject: (reason: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function rebuildError(name: string, message: string): Error {
  // The two the UI branches on. Anything else is genuinely unexpected and
  // should surface as a plain Error rather than be quietly reshaped.
  if (name === 'EnvelopeError') return new EnvelopeError(message);
  if (name === 'VaultKeyError') return new VaultKeyError(message);
  const error = new Error(message);
  error.name = name;
  return error;
}

function ensureWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'fgk-crypto',
  });

  worker.addEventListener('message', (event: MessageEvent<CryptoResponse>) => {
    const response = event.data;
    const waiting = pending.get(response.id);
    if (!waiting) return;
    pending.delete(response.id);

    if (response.ok) {
      waiting.resolve(response.result as never);
    } else {
      waiting.reject(rebuildError(response.name, response.message));
    }
  });

  worker.addEventListener('error', (event) => {
    // A worker that failed to load fails every request in flight; leaving them
    // pending would hang the unlock screen with a spinner and no explanation.
    const error = new Error(event.message || 'The encryption worker failed to start');
    for (const [, waiting] of pending) waiting.reject(error);
    pending.clear();
    worker = null;
  });

  return worker;
}

/**
 * A plain `Omit<CryptoRequest, 'id'>` collapses the union down to the keys its
 * members share, which is just `op`. Distributing over the members first keeps
 * each variant's own fields.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function send<T>(request: DistributiveOmit<CryptoRequest, 'id'>): Promise<T> {
  const id = nextId++;
  const active = ensureWorker();

  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: never) => void, reject });
    active.postMessage({ ...request, id } as CryptoRequest);
  });
}

export const workerEngine: CryptoEngine = {
  setUpVault: (passphrase) => send({ op: 'setUpVault', passphrase }),

  unlock: (passphrase, wrapping) => send({ op: 'unlock', passphrase, wrapping }),

  recoverAndRewrap: (recoveryCode, wrapping, newPassphrase) =>
    send({ op: 'recoverAndRewrap', recoveryCode, wrapping, newPassphrase }),

  changePassphrase: (currentPassphrase, wrapping: WrappingRecord, newPassphrase) =>
    send({ op: 'changePassphrase', currentPassphrase, wrapping, newPassphrase }),
};

/** Releases the worker. Called when the vault locks. */
export function terminateCryptoWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}
