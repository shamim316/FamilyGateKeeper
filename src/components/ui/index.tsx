'use client';

/**
 * The small set of primitives every screen is built from.
 *
 * Sized for the audience in the plan — a grandparent on a phone, not a power
 * user. Touch targets are 48px, body text is 17px, and inputs never drop below
 * 16px because anything smaller makes iOS Safari zoom the page on focus, which
 * reads as the form jumping away from you.
 */

import { forwardRef, useId, useState } from 'react';
import { passphraseStrength } from '@/lib/crypto/passphrase-strength';

/** Joins class names, dropping anything falsy so `condition && 'class'` works. */
function classes(...values: unknown[]): string {
  return values.filter((value) => typeof value === 'string' && value.length > 0).join(' ');
}

// ---------------------------------------------------------------------------

export function Screen({
  title,
  lead,
  children,
  width = 'narrow',
}: {
  title?: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  width?: 'narrow' | 'wide';
}) {
  return (
    <main
      className={classes(
        'mx-auto px-5 py-10 sm:py-16',
        width === 'narrow' ? 'max-w-md' : 'max-w-2xl',
      )}
    >
      {title && <h1 className="text-3xl leading-tight font-bold text-balance">{title}</h1>}
      {lead && <div className="mt-3 text-[var(--color-ink-soft)]">{lead}</div>}
      <div className={title || lead ? 'mt-8' : undefined}>{children}</div>
    </main>
  );
}

// ---------------------------------------------------------------------------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  busy?: boolean;
  fullWidth?: boolean;
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-[var(--color-accent)] text-white hover:opacity-90',
  secondary:
    'border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-accent)]',
  quiet: 'text-[var(--color-accent)] hover:underline',
  danger: 'bg-[var(--color-danger)] text-white hover:opacity-90',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', busy, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // A busy button stays enabled to screen readers via aria-busy but cannot
      // be pressed twice, which matters when the action takes three seconds.
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={classes(
        'inline-flex min-h-[var(--spacing-touch)] items-center justify-center gap-2 rounded-[var(--radius-card)] px-5 font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {busy && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------

type TextFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className, ...rest },
  ref,
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-[var(--color-ink-soft)]">
          {hint}
        </p>
      )}
      <input
        ref={ref}
        id={id}
        aria-describedby={classes(hint && hintId, error && errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={classes(
          'min-h-[var(--spacing-touch)] w-full rounded-[var(--radius-card)] border bg-[var(--color-surface)] px-4',
          error ? 'border-[var(--color-danger)]' : 'border-[var(--color-line)]',
          className,
        )}
        {...rest}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------

/**
 * A passphrase field with a strength reading and a reveal toggle.
 *
 * The strength meter scores rather than blocks, matching the deliberate choice
 * in kdf.ts: a hard gate produces a passphrase on a sticky note, which is worse
 * than a mediocre one someone actually remembers. There is still a length floor
 * — below ten characters this is not worth encrypting behind.
 */
export const MINIMUM_PASSPHRASE_LENGTH = 10;

const STRENGTH_COLORS = [
  'var(--color-danger)',
  'var(--color-danger)',
  'var(--color-warn)',
  'var(--color-accent)',
  'var(--color-accent)',
];

export function PassphraseField({
  label,
  value,
  onChange,
  error,
  showStrength = false,
  autoComplete = 'current-password',
  hint,
  name,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  showStrength?: boolean;
  autoComplete?: string;
  hint?: React.ReactNode;
  name?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const strength = passphraseStrength(value);
  const meterId = useId();

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{label}</span>
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          className="text-sm font-medium text-[var(--color-accent)] hover:underline"
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>

      <TextField
        label=""
        name={name}
        type={revealed ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        hint={hint}
        aria-label={label}
        className="font-mono"
      />

      {showStrength && value.length > 0 && (
        <div className="grid gap-1" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((segment) => (
              <span
                key={segment}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background:
                    segment < strength.score
                      ? STRENGTH_COLORS[strength.score]
                      : 'var(--color-line)',
                }}
              />
            ))}
          </div>
          {/* Strength only. The length floor is reported once, as the field's
              error, so the same sentence does not appear twice on screen. */}
          <p id={meterId} className="text-sm text-[var(--color-ink-soft)]">
            {strength.label}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
}) {
  const tones = {
    info: 'border-[var(--color-line)] bg-[var(--color-accent-soft)]',
    warning: 'border-[var(--color-warn)] bg-[var(--color-warn-soft)]',
    danger: 'border-[var(--color-danger)] bg-[var(--color-warn-soft)]',
  };

  return (
    <div className={classes('rounded-[var(--radius-card)] border p-4', tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={classes('text-[var(--color-ink-soft)]', title && 'mt-1')}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-6 shrink-0 accent-[var(--color-accent)]"
      />
      <label htmlFor={id} className="leading-snug">
        {label}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
      {children}
    </p>
  );
}
