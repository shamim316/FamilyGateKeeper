import { describe, expect, it, vi } from 'vitest';
import { AutosaveEngine, saveStatusMessage, type AutosaveState } from './autosave';
import type { FormValues } from './definition';

/** A hand-wound timer queue, so a minute of typing runs in a millisecond. */
function testTimers() {
  const timers: { at: number; callback: () => void; id: number }[] = [];
  let now = 0;
  let nextId = 1;

  return {
    setTimer(callback: () => void, ms: number) {
      const id = nextId++;
      timers.push({ at: now + ms, callback, id });
      return id;
    },
    clearTimer(handle: unknown) {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index !== -1) timers.splice(index, 1);
    },
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = timers.filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at)[0];
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

function makeEngine(
  save: (patch: FormValues) => Promise<void>,
  timers = testTimers(),
  debounceMs = 800,
) {
  const engine = new AutosaveEngine({
    save,
    debounceMs,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return { engine, timers };
}

/** Lets a test control exactly when a save resolves. */
function deferredSave() {
  const calls: FormValues[] = [];
  let resolveCurrent: (() => void) | null = null;
  let rejectCurrent: ((error: Error) => void) | null = null;

  const save = (patch: FormValues) => {
    calls.push(patch);
    return new Promise<void>((resolve, reject) => {
      resolveCurrent = resolve;
      rejectCurrent = reject;
    });
  };

  return {
    save,
    calls,
    resolve: () => resolveCurrent?.(),
    reject: (error: Error) => rejectCurrent?.(error),
  };
}

describe('coalescing edits', () => {
  it('saves nothing until typing stops', async () => {
    const save = vi.fn(async () => {});
    const { engine, timers } = makeEngine(save);

    engine.change('name', 'R');
    engine.change('name', 'Ri');
    engine.change('name', 'Riv');

    timers.advance(700);
    expect(save).not.toHaveBeenCalled();

    timers.advance(200);
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith({ name: 'Riv' });
  });

  it('rolls several fields into one save', async () => {
    const save = vi.fn(async () => {});
    const { engine, timers } = makeEngine(save);

    engine.change('name', 'Riverside');
    engine.change('phone', '555-0100');
    engine.change('category', 'Plumber');

    timers.advance(800);
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());

    expect(save).toHaveBeenCalledWith({
      name: 'Riverside',
      phone: '555-0100',
      category: 'Plumber',
    });
  });

  it('saves immediately when asked, without waiting for the timer', async () => {
    const save = vi.fn(async () => {});
    const { engine, timers } = makeEngine(save);

    engine.change('name', 'Riverside');
    await engine.flush();

    expect(save).toHaveBeenCalledOnce();
    // The pending timer must not fire a second, empty save.
    timers.advance(2000);
    expect(save).toHaveBeenCalledOnce();
  });

  it('does nothing when there is nothing to save', async () => {
    const save = vi.fn(async () => {});
    const { engine } = makeEngine(save);

    await engine.flush();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('reporting what is happening', () => {
  it('walks from pending through saving to saved', async () => {
    const deferred = deferredSave();
    const { engine, timers } = makeEngine(deferred.save);

    const seen: AutosaveState['status'][] = [];
    engine.subscribe((state) => seen.push(state.status));

    engine.change('name', 'Riverside');
    expect(engine.getState().status).toBe('pending');

    timers.advance(800);
    await vi.waitFor(() => expect(engine.getState().status).toBe('saving'));

    deferred.resolve();
    await vi.waitFor(() => expect(engine.getState().status).toBe('saved'));

    expect(seen).toEqual(['pending', 'saving', 'saved']);
  });

  it('reports unsaved work, so a page can warn before leaving', async () => {
    const deferred = deferredSave();
    const { engine } = makeEngine(deferred.save);

    expect(engine.getState().dirty).toBe(false);

    engine.change('name', 'Riverside');
    expect(engine.getState().dirty).toBe(true);

    const flushed = engine.flush();
    deferred.resolve();
    await flushed;

    expect(engine.getState().dirty).toBe(false);
  });

  it('gives the indicator plain words', () => {
    const base = { error: null, dirty: false };
    expect(saveStatusMessage({ ...base, status: 'saving' })).toBe('Saving…');
    expect(saveStatusMessage({ ...base, status: 'saved' })).toBe('Saved');
    expect(saveStatusMessage({ ...base, status: 'error' })).toBe('Could not save');
    // A quiet form is a calm one: nothing to say while idle or mid-keystroke.
    expect(saveStatusMessage({ ...base, status: 'idle' })).toBeNull();
    expect(saveStatusMessage({ ...base, status: 'pending' })).toBeNull();
  });
});

describe('never losing work', () => {
  it('keeps the patch when a save fails', async () => {
    const deferred = deferredSave();
    const { engine } = makeEngine(deferred.save);

    engine.change('name', 'Riverside');
    const flushed = engine.flush();
    deferred.reject(new Error('offline'));
    await flushed;

    const state = engine.getState();
    expect(state.status).toBe('error');
    expect(state.error?.message).toBe('offline');
    // The user watched themselves type this; it must still be here.
    expect(state.dirty).toBe(true);
  });

  it('sends the kept patch on retry', async () => {
    const attempts: FormValues[] = [];
    let failNext = true;
    const { engine } = makeEngine(async (patch) => {
      attempts.push(patch);
      if (failNext) {
        failNext = false;
        throw new Error('offline');
      }
    });

    engine.change('name', 'Riverside');
    await engine.flush();
    expect(engine.getState().status).toBe('error');

    await engine.retry();

    expect(attempts).toEqual([{ name: 'Riverside' }, { name: 'Riverside' }]);
    expect(engine.getState().status).toBe('saved');
    expect(engine.getState().dirty).toBe(false);
  });

  it('lets a newer edit win over a retried older one', async () => {
    const attempts: FormValues[] = [];
    let failNext = true;
    const { engine } = makeEngine(async (patch) => {
      attempts.push(patch);
      if (failNext) {
        failNext = false;
        throw new Error('offline');
      }
    });

    engine.change('name', 'First try');
    await engine.flush();
    expect(engine.getState().status).toBe('error');

    // They fix the typo while the failure is still on screen. A retry must not
    // resurrect the old value.
    engine.change('name', 'Corrected');
    await engine.flush();

    expect(attempts[attempts.length - 1]).toEqual({ name: 'Corrected' });
    expect(engine.getState().status).toBe('saved');
  });

  it('recovers a failed field alongside a later, different one', async () => {
    const attempts: FormValues[] = [];
    let failNext = true;
    const { engine } = makeEngine(async (patch) => {
      attempts.push(patch);
      if (failNext) {
        failNext = false;
        throw new Error('offline');
      }
    });

    engine.change('name', 'Riverside');
    await engine.flush();

    engine.change('phone', '555-0100');
    await engine.flush();

    // Both survive: the one that failed and the one typed afterwards.
    expect(attempts[attempts.length - 1]).toEqual({
      name: 'Riverside',
      phone: '555-0100',
    });
  });

  it('ignores a retry when nothing has failed', async () => {
    const save = vi.fn(async () => {});
    const { engine } = makeEngine(save);

    await engine.retry();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('overlapping saves', () => {
  it('never has two writes in flight at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const gates: (() => void)[] = [];

    const { engine } = makeEngine(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => gates.push(resolve));
      inFlight -= 1;
    });

    engine.change('name', 'One');
    const first = engine.flush();

    engine.change('phone', 'Two');
    const second = engine.flush();

    // Release both saves.
    await vi.waitFor(() => expect(gates.length).toBeGreaterThan(0));
    gates.forEach((release) => release());
    await vi.waitFor(() => expect(gates.length).toBe(2));
    gates.forEach((release) => release());

    await Promise.all([first, second]);
    expect(maxInFlight).toBe(1);
  });

  it('picks up an edit made mid-save without being asked again', async () => {
    const deferred = deferredSave();
    const { engine } = makeEngine(deferred.save);

    engine.change('name', 'Riverside');
    const flushed = engine.flush();
    await vi.waitFor(() => expect(deferred.calls).toHaveLength(1));

    // Typing continues while the first write is still on the wire. Nobody is
    // going to call flush again for this, so the engine has to notice by itself
    // — otherwise the field sits unsaved until the next keystroke elsewhere.
    engine.change('phone', '555-0100');

    deferred.resolve();
    await vi.waitFor(() => expect(deferred.calls).toHaveLength(2));
    deferred.resolve();
    await flushed;

    expect(deferred.calls[0]).toEqual({ name: 'Riverside' });
    expect(deferred.calls[1]).toEqual({ phone: '555-0100' });
    expect(engine.getState().dirty).toBe(false);
    expect(engine.getState().status).toBe('saved');
  });
});

describe('cleaning up', () => {
  it('leaves no timer running once disposed', () => {
    const save = vi.fn(async () => {});
    const { engine, timers } = makeEngine(save);

    engine.change('name', 'Riverside');
    expect(timers.pending()).toBe(1);

    engine.dispose();
    expect(timers.pending()).toBe(0);

    timers.advance(5000);
    expect(save).not.toHaveBeenCalled();
  });
});
