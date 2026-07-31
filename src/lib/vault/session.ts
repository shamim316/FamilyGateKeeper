/**
 * The lock state machine.
 *
 * Deliberately free of React and of the browser: the timer source, the clock,
 * and the cross-tab channel are all injected. Auto-lock is the kind of logic
 * that is either right or quietly wrong for months, and the only way to be sure
 * is to be able to run a day of idling through it in a millisecond.
 *
 * The unlocked data key lives here and nowhere else. It is held in memory only
 * — never localStorage, never IndexedDB — so closing the tab locks the vault,
 * and a full page reload requires unlocking again. That friction is the reason
 * Milestone 10's quick-unlock exists; it is not an oversight.
 */

export type VaultState =
  | { status: 'locked'; reason: LockReason | null }
  | { status: 'unlocking' }
  | { status: 'unlocked'; dek: CryptoKey; familyId: string };

export type LockReason = 'idle' | 'manual' | 'signed-out' | 'other-tab';

export const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export interface SessionOptions {
  idleTimeoutMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Broadcasts locks to this browser's other tabs. */
  channel?: LockChannel;
}

export interface LockChannel {
  post(reason: LockReason): void;
  subscribe(handler: (reason: LockReason) => void): () => void;
}

type Listener = (state: VaultState) => void;

export class VaultSession {
  private state: VaultState = { status: 'locked', reason: null };
  private listeners = new Set<Listener>();
  private timerHandle: unknown = null;
  private lastActivityAt: number;
  private unsubscribeChannel: (() => void) | null = null;

  private readonly idleTimeoutMs: number;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly channel: LockChannel | null;

  constructor(options: SessionOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as number));
    this.channel = options.channel ?? null;
    this.lastActivityAt = this.now();

    if (this.channel) {
      this.unsubscribeChannel = this.channel.subscribe(() => {
        // Another tab locked. Lock here too, without echoing the message back.
        if (this.state.status !== 'locked') this.applyLock('other-tab');
      });
    }
  }

  getState(): VaultState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) listener(this.state);
  }

  private setState(state: VaultState) {
    this.state = state;
    this.emit();
  }

  beginUnlocking() {
    this.setState({ status: 'unlocking' });
  }

  unlocked(dek: CryptoKey, familyId: string) {
    this.setState({ status: 'unlocked', dek, familyId });
    this.lastActivityAt = this.now();
    this.scheduleIdleCheck();
  }

  /** Call on real user interaction. Cheap enough to wire to pointer and key events. */
  noteActivity() {
    if (this.state.status !== 'unlocked') return;
    this.lastActivityAt = this.now();
  }

  lock(reason: LockReason = 'manual') {
    if (this.state.status === 'locked') return;
    this.applyLock(reason);
    this.channel?.post(reason);
  }

  private applyLock(reason: LockReason) {
    this.cancelTimer();
    // Dropping the reference is all that can be done: a CryptoKey has no
    // destructor, so this hands it to the garbage collector and no more.
    this.setState({ status: 'locked', reason });
  }

  private cancelTimer() {
    if (this.timerHandle !== null) {
      this.clearTimer(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /**
   * Re-arms rather than locking outright when activity has happened since the
   * timer was set. A single long timer would lock someone mid-sentence; one
   * reset per keystroke would churn timers on every event.
   */
  private scheduleIdleCheck() {
    this.cancelTimer();

    const elapsed = this.now() - this.lastActivityAt;
    const remaining = this.idleTimeoutMs - elapsed;

    this.timerHandle = this.setTimer(
      () => {
        this.timerHandle = null;
        if (this.state.status !== 'unlocked') return;

        if (this.now() - this.lastActivityAt >= this.idleTimeoutMs) {
          this.lock('idle');
        } else {
          this.scheduleIdleCheck();
        }
      },
      Math.max(remaining, 0),
    );
  }

  /** Releases the cross-tab subscription. */
  dispose() {
    this.cancelTimer();
    this.unsubscribeChannel?.();
    this.unsubscribeChannel = null;
    this.listeners.clear();
  }
}

/** A LockChannel over BroadcastChannel, or a no-op where it is unavailable. */
export function createLockChannel(name = 'fgk-vault-lock'): LockChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: () => {}, subscribe: () => () => {} };
  }

  const channel = new BroadcastChannel(name);

  return {
    post(reason) {
      channel.postMessage(reason);
    },
    subscribe(handler) {
      const listener = (event: MessageEvent<LockReason>) => handler(event.data);
      channel.addEventListener('message', listener);
      return () => channel.removeEventListener('message', listener);
    },
  };
}

/** Plain-language explanation for the unlock screen. */
export function lockReasonMessage(reason: LockReason | null): string | null {
  switch (reason) {
    case 'idle':
      return 'Your vault locked itself after a while of no activity.';
    case 'other-tab':
      return 'You locked your vault in another tab.';
    case 'signed-out':
      return 'You were signed out.';
    case 'manual':
    case null:
      return null;
  }
}
