import { describe, expect, it, vi } from 'vitest';
import {
  VaultSession,
  createLockChannel,
  lockReasonMessage,
  type LockChannel,
  type LockReason,
  type VaultState,
} from './session';

/**
 * A hand-wound clock and timer queue. Real timers would make these tests slow
 * and flaky, and the whole point of injecting them is to be able to run
 * fifteen idle minutes instantly.
 */
function testClock() {
  let now = 1_000_000;
  const timers: { at: number; callback: () => void; id: number }[] = [];
  let nextId = 1;

  return {
    now: () => now,
    setTimer(callback: () => void, ms: number) {
      const id = nextId++;
      timers.push({ at: now + ms, callback, id });
      return id;
    },
    clearTimer(handle: unknown) {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index !== -1) timers.splice(index, 1);
    },
    /** Advances time, firing anything due along the way. */
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = timers
          .filter((timer) => timer.at <= target)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        now = due.at;
        due.callback();
      }
      now = target;
    },
    pending: () => timers.length,
  };
}

const FAKE_KEY = { type: 'secret' } as unknown as CryptoKey;

function makeSession(clock: ReturnType<typeof testClock>, extra: Partial<{ channel: LockChannel }> = {}) {
  return new VaultSession({
    idleTimeoutMs: 15 * 60 * 1000,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...extra,
  });
}

describe('the lock state machine', () => {
  it('starts locked', () => {
    const session = makeSession(testClock());
    expect(session.getState()).toEqual({ status: 'locked', reason: null });
  });

  it('moves through unlocking to unlocked', () => {
    const clock = testClock();
    const session = makeSession(clock);
    const seen: VaultState['status'][] = [];
    session.subscribe((state) => seen.push(state.status));

    session.beginUnlocking();
    session.unlocked(FAKE_KEY, 'family-1');

    expect(seen).toEqual(['unlocking', 'unlocked']);
    expect(session.getState()).toEqual({
      status: 'unlocked',
      dek: FAKE_KEY,
      familyId: 'family-1',
    });
  });

  it('drops the key when locked', () => {
    const session = makeSession(testClock());
    session.unlocked(FAKE_KEY, 'family-1');
    session.lock();

    const state = session.getState();
    expect(state.status).toBe('locked');
    expect('dek' in state).toBe(false);
  });

  it('tells listeners when the state changes', () => {
    const session = makeSession(testClock());
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    session.unlocked(FAKE_KEY, 'family-1');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    session.lock();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('auto-lock', () => {
  it('locks after the idle timeout', () => {
    const clock = testClock();
    const session = makeSession(clock);
    session.unlocked(FAKE_KEY, 'family-1');

    clock.advance(14 * 60 * 1000);
    expect(session.getState().status).toBe('unlocked');

    clock.advance(1 * 60 * 1000);
    expect(session.getState()).toEqual({ status: 'locked', reason: 'idle' });
  });

  it('stays open while someone is actually using it', () => {
    const clock = testClock();
    const session = makeSession(clock);
    session.unlocked(FAKE_KEY, 'family-1');

    // Half an hour of work, touching the app every ten minutes.
    for (let i = 0; i < 3; i += 1) {
      clock.advance(10 * 60 * 1000);
      session.noteActivity();
      expect(session.getState().status).toBe('unlocked');
    }

    // Then they walk away.
    clock.advance(15 * 60 * 1000);
    expect(session.getState().status).toBe('locked');
  });

  it('does not lock mid-sentence when activity lands just before the timer', () => {
    const clock = testClock();
    const session = makeSession(clock);
    session.unlocked(FAKE_KEY, 'family-1');

    clock.advance(14 * 60 * 59 * 1000 / 60); // one second short
    session.noteActivity();

    // The original timer fires here and must re-arm rather than lock.
    clock.advance(2000);
    expect(session.getState().status).toBe('unlocked');
  });

  it('ignores activity once locked', () => {
    const clock = testClock();
    const session = makeSession(clock);
    session.unlocked(FAKE_KEY, 'family-1');

    clock.advance(15 * 60 * 1000);
    expect(session.getState().status).toBe('locked');

    session.noteActivity();
    expect(session.getState().status).toBe('locked');
  });

  it('leaves no timer running after locking', () => {
    const clock = testClock();
    const session = makeSession(clock);
    session.unlocked(FAKE_KEY, 'family-1');
    session.lock();

    expect(clock.pending()).toBe(0);
  });

  it('records why it locked', () => {
    const clock = testClock();
    const session = makeSession(clock);

    session.unlocked(FAKE_KEY, 'family-1');
    session.lock('signed-out');
    expect(session.getState()).toEqual({ status: 'locked', reason: 'signed-out' });
  });
});

describe('locking every tab at once', () => {
  function fakeChannel() {
    const handlers = new Set<(reason: LockReason) => void>();
    const posted: LockReason[] = [];

    const channel: LockChannel = {
      post(reason) {
        // A real BroadcastChannel does not deliver back to the sender, so this
        // records the message without invoking the local handlers.
        posted.push(reason);
      },
      subscribe(handler) {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };

    return {
      channel,
      posted,
      deliver(reason: LockReason) {
        for (const handler of handlers) handler(reason);
      },
    };
  }

  it('announces a lock to the other tabs', () => {
    const clock = testClock();
    const fake = fakeChannel();
    const session = makeSession(clock, { channel: fake.channel });

    session.unlocked(FAKE_KEY, 'family-1');
    session.lock('manual');

    expect(fake.posted).toEqual(['manual']);
  });

  it('locks when another tab says it did', () => {
    const clock = testClock();
    const fake = fakeChannel();
    const session = makeSession(clock, { channel: fake.channel });

    session.unlocked(FAKE_KEY, 'family-1');
    fake.deliver('manual');

    expect(session.getState()).toEqual({ status: 'locked', reason: 'other-tab' });
  });

  it('does not echo a lock it received', () => {
    const clock = testClock();
    const fake = fakeChannel();
    const session = makeSession(clock, { channel: fake.channel });

    session.unlocked(FAKE_KEY, 'family-1');
    fake.deliver('idle');

    // Echoing would bounce the message between tabs forever.
    expect(fake.posted).toEqual([]);
  });

  it('stops listening once disposed', () => {
    const clock = testClock();
    const fake = fakeChannel();
    const session = makeSession(clock, { channel: fake.channel });

    session.unlocked(FAKE_KEY, 'family-1');
    session.dispose();
    fake.deliver('manual');

    expect(session.getState().status).toBe('unlocked');
  });

  it('works where BroadcastChannel does not exist', () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error deliberately removing it to exercise the fallback
    delete globalThis.BroadcastChannel;

    try {
      const channel = createLockChannel();
      expect(() => channel.post('manual')).not.toThrow();
      expect(() => channel.subscribe(() => {})()).not.toThrow();
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });
});

describe('explaining the lock to the user', () => {
  it('says something useful when the vault locked itself', () => {
    expect(lockReasonMessage('idle')).toMatch(/no activity/);
    expect(lockReasonMessage('other-tab')).toMatch(/another tab/);
    expect(lockReasonMessage('signed-out')).toMatch(/signed out/);
  });

  it('stays quiet when the user locked it deliberately', () => {
    // They just pressed the button; telling them they pressed it is noise.
    expect(lockReasonMessage('manual')).toBeNull();
    expect(lockReasonMessage(null)).toBeNull();
  });
});
