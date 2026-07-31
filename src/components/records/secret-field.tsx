'use client';

/**
 * Showing and copying a secret.
 *
 * Two competing needs. The point of a vault is that an SSN is not sitting in
 * plain sight when someone hands their phone to a child, so the default is
 * masked. But the reason anyone opens this app is to read a number out loud or
 * paste it into a form, so revealing has to be one tap and copying another.
 *
 * The clipboard clears itself after thirty seconds. A copied account number
 * otherwise lingers there for the rest of the day, readable by anything that
 * asks for it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export const CLIPBOARD_CLEAR_MS = 30_000;

export function maskOf(value: string): string {
  if (value.length === 0) return '';
  return '•'.repeat(Math.min(Math.max(value.length, 4), 12));
}

/**
 * Copies, then wipes the clipboard a little later.
 *
 * Clearing only ever writes an empty string. Trying to restore whatever was
 * there before would mean holding a copy of the user's clipboard, which is a
 * worse idea than the problem it solves.
 */
export function useCopyWithClear(): {
  copied: boolean;
  copy: (value: string) => Promise<void>;
} {
  const [copied, setCopied] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
    },
    [],
  );

  const copy = useCallback(async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      if (badgeTimer.current) clearTimeout(badgeTimer.current);
      badgeTimer.current = setTimeout(() => setCopied(false), 2500);

      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => {
        void navigator.clipboard.writeText('').catch(() => {});
      }, CLIPBOARD_CLEAR_MS);
    } catch {
      // Denied, or an insecure context. Reveal still works, so there is a way
      // through and nothing to report.
    }
  }, []);

  return { copied, copy };
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { copied, copy } = useCopyWithClear();

  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      disabled={!value}
      aria-label={label ? `Copy ${label}` : 'Copy'}
      className="shrink-0 text-sm font-medium text-[var(--color-accent)] hover:underline disabled:opacity-40 disabled:hover:no-underline"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** A read-only secret, for summary and emergency screens. */
export function SecretValue({
  value,
  label,
  autoHideMs = 60_000,
}: {
  value: string;
  label: string;
  /** Re-masks on its own, so a revealed number does not stay on screen. */
  autoHideMs?: number;
}) {
  const [revealed, setRevealed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  function toggle() {
    setRevealed((current) => {
      const next = !current;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (next && autoHideMs > 0) {
        hideTimer.current = setTimeout(() => setRevealed(false), autoHideMs);
      }
      return next;
    });
  }

  if (value === '') {
    return <span className="text-[var(--color-ink-soft)]">Not recorded</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-3">
      <span
        className="font-mono tracking-wide break-all"
        // A screen reader should not read out a row of bullets.
        aria-label={revealed ? undefined : `${label}, hidden`}
      >
        {revealed ? value : maskOf(value)}
      </span>

      <button
        type="button"
        onClick={toggle}
        className="text-sm font-medium text-[var(--color-accent)] hover:underline"
      >
        {revealed ? 'Hide' : 'Show'}
      </button>

      <CopyButton value={value} label={label} />
    </span>
  );
}
