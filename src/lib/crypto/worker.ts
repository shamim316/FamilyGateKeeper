/// <reference lib="webworker" />

/**
 * The crypto worker.
 *
 * Argon2id at the parameters in kdf.ts takes one to three seconds. Running it
 * on the main thread would freeze the tab during the single most anxious
 * moment in the app — the pause after someone types their passphrase — so it
 * happens here instead.
 *
 * The isolation is worth as much as the responsiveness. Passphrases, recovery
 * codes, and raw data-key bytes exist only in this thread. What goes back is a
 * non-extractable `CryptoKey`, which survives structured cloning: the main
 * thread can encrypt and decrypt with it but can never read it out.
 */

import { directEngine } from './engine';
import type { CryptoRequest, CryptoResponse } from './worker-protocol';

async function handle(request: CryptoRequest): Promise<CryptoResponse> {
  try {
    switch (request.op) {
      case 'setUpVault':
        return { id: request.id, ok: true, op: 'setUpVault', result: await directEngine.setUpVault(request.passphrase) };

      case 'unlock':
        return {
          id: request.id,
          ok: true,
          op: 'unlock',
          result: await directEngine.unlock(request.passphrase, request.wrapping),
        };

      case 'recoverAndRewrap':
        return {
          id: request.id,
          ok: true,
          op: 'recoverAndRewrap',
          result: await directEngine.recoverAndRewrap(
            request.recoveryCode,
            request.wrapping,
            request.newPassphrase,
          ),
        };

      case 'changePassphrase':
        return {
          id: request.id,
          ok: true,
          op: 'changePassphrase',
          result: await directEngine.changePassphrase(
            request.currentPassphrase,
            request.wrapping,
            request.newPassphrase,
          ),
        };
    }
  } catch (error) {
    // Error objects do not survive structured cloning intact, so the name and
    // message are sent across and rebuilt on the other side.
    const name = error instanceof Error ? error.name : 'Error';
    const message = error instanceof Error ? error.message : String(error);
    return { id: request.id, ok: false, name, message };
  }
}

self.addEventListener('message', (event: MessageEvent<CryptoRequest>) => {
  void handle(event.data).then((response) => {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
  });
});
