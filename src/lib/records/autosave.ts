/**
 * Autosave.
 *
 * The plan calls for forms with no Save button: type, and it is kept. That is
 * the right choice for long forms filled in over months, and it puts the whole
 * burden of not losing anyone's work here.
 *
 * The rules that follow from that:
 *
 *   - A failed save keeps its patch. Dropping it would silently discard
 *     something the user watched themselves type.
 *   - Newer edits always win over a retried older one, so a retry cannot
 *     resurrect a value the user has since changed.
 *   - Only one save is ever in flight, so two overlapping writes cannot land
 *     out of order.
 *
 * Timers are injected, like VaultSession, so a test can run a minute of typing
 * in a millisecond.
 */

import type { FormValue, FormValues } from './definition';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveState {
  status: SaveStatus;
  error: Error | null;
  /** True when there is unsaved work — used to warn before leaving. */
  dirty: boolean;
}

export interface AutosaveOptions {
  save: (patch: FormValues) => Promise<void>;
  debounceMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Long enough that a sentence is one save rather than forty, short enough that
 * closing the laptop a moment after typing does not lose the last field.
 */
export const DEFAULT_DEBOUNCE_MS = 800;

export class AutosaveEngine {
  private pending: FormValues = {};
  private status: SaveStatus = 'idle';
  private error: Error | null = null;
  private timer: unknown = null;
  private flushing: Promise<void> | null = null;
  private listeners = new Set<(state: AutosaveState) => void>();

  private readonly save: (patch: FormValues) => Promise<void>;
  private readonly debounceMs: number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(options: AutosaveOptions) {
    this.save = options.save;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as number));
  }

  getState(): AutosaveState {
    return {
      status: this.status,
      error: this.error,
      dirty: Object.keys(this.pending).length > 0,
    };
  }

  subscribe(listener: (state: AutosaveState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }

  private setStatus(status: SaveStatus) {
    this.status = status;
    this.emit();
  }

  private cancelTimer() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /** Records an edit and schedules a save. */
  change(name: string, value: FormValue): void {
    this.pending[name] = value;
    this.error = null;
    this.setStatus('pending');

    this.cancelTimer();
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.flush().catch(() => {
        // Already reflected in state; nothing here should reject into the void.
      });
    }, this.debounceMs);
  }

  /**
   * Saves everything outstanding now. Called on blur, before navigating away,
   * and when the component unmounts.
   */
  async flush(): Promise<void> {
    this.cancelTimer();

    // One flush at a time. A second caller waits for the first, which will
    // already have picked up whatever they queued.
    if (this.flushing) {
      await this.flushing;
      if (Object.keys(this.pending).length === 0) return;
    }

    this.flushing = this.drain();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  private async drain(): Promise<void> {
    while (Object.keys(this.pending).length > 0) {
      const patch = this.pending;
      this.pending = {};
      this.setStatus('saving');

      try {
        await this.save(patch);
        this.error = null;
      } catch (error) {
        // Put the patch back so nothing is lost — but behind anything typed
        // since, so a retry cannot overwrite a newer value with an older one.
        this.pending = { ...patch, ...this.pending };
        this.error = error instanceof Error ? error : new Error(String(error));
        this.setStatus('error');
        return;
      }

      if (Object.keys(this.pending).length === 0) {
        this.setStatus('saved');
      }
    }
  }

  /** Tries again after a failure, keeping whatever is outstanding. */
  async retry(): Promise<void> {
    if (this.status !== 'error') return;
    this.error = null;
    this.setStatus('pending');
    await this.flush();
  }

  dispose(): void {
    this.cancelTimer();
    this.listeners.clear();
  }
}

/** Wording for the save indicator. Silent when idle — a quiet form is a calm one. */
export function saveStatusMessage(state: AutosaveState): string | null {
  switch (state.status) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Could not save';
    case 'pending':
    case 'idle':
      return null;
  }
}
