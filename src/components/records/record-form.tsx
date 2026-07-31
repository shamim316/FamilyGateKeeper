'use client';

/**
 * A form built from a record definition.
 *
 * There is no Save button anywhere in it. Editing writes as you go, which is
 * the right shape for forms filled in a field at a time over months, and it
 * means the only way to lose work is a bug in the autosave engine — which is
 * why that engine is tested harder than anything else here.
 *
 * Fields marked `more` in the definition stay collapsed. A form that opens with
 * forty inputs is a form nobody finishes, and every category in this app has
 * forty inputs.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FieldSpec, FormValue, FormValues, RecordDefinition } from '@/lib/records/definition';
import { AutosaveEngine, saveStatusMessage, type AutosaveState } from '@/lib/records/autosave';
import { CopyButton } from './secret-field';
import { Button } from '@/components/ui';

export function RecordForm({
  definition,
  initialValues,
  onSave,
  autoFocusFirst = false,
}: {
  definition: RecordDefinition;
  initialValues: FormValues;
  onSave: (patch: FormValues) => Promise<void>;
  autoFocusFirst?: boolean;
}) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [showMore, setShowMore] = useState(false);
  const [saveState, setSaveState] = useState<AutosaveState>({
    status: 'idle',
    error: null,
    dirty: false,
  });

  // A ref, not state: the engine must survive re-renders, and every keystroke
  // is a re-render.
  const engineRef = useRef<AutosaveEngine | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  if (engineRef.current === null) {
    engineRef.current = new AutosaveEngine({
      save: (patch) => onSaveRef.current(patch),
    });
  }
  const engine = engineRef.current;

  useEffect(() => engine.subscribe(setSaveState), [engine]);

  useEffect(() => {
    return () => {
      // Leaving the page must not drop the last thing typed.
      void engine.flush().catch(() => {});
      engine.dispose();
    };
  }, [engine]);

  // The browser's own "leave site?" prompt is the only thing that can stop a
  // tab closing over unsaved work.
  useEffect(() => {
    if (!saveState.dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState.dirty]);

  function change(field: FieldSpec, value: FormValue) {
    setValues((current) => ({ ...current, [field.name]: value }));
    engine.change(field.name, value);
  }

  const core = useMemo(
    () => definition.fields.filter((field) => (field.group ?? 'more') === 'core'),
    [definition],
  );
  const more = useMemo(
    () => definition.fields.filter((field) => (field.group ?? 'more') !== 'core'),
    [definition],
  );

  const filledMoreCount = more.filter((field) => {
    const value = values[field.name];
    return typeof value === 'string' ? value.trim() !== '' : value === true;
  }).length;

  return (
    <div className="grid gap-6">
      <SaveIndicator state={saveState} onRetry={() => void engine.retry()} />

      <div className="grid gap-5">
        {core.map((field, index) => (
          <Field
            key={field.name}
            field={field}
            value={values[field.name] ?? ''}
            onChange={(value) => change(field, value)}
            onBlur={() => void engine.flush().catch(() => {})}
            autoFocus={autoFocusFirst && index === 0}
          />
        ))}
      </div>

      {more.length > 0 && (
        <div className="border-t border-[var(--color-line)] pt-6">
          {showMore ? (
            <div className="grid gap-5">
              {more.map((field) => (
                <Field
                  key={field.name}
                  field={field}
                  value={values[field.name] ?? ''}
                  onChange={(value) => change(field, value)}
                  onBlur={() => void engine.flush().catch(() => {})}
                />
              ))}
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setShowMore(true)} fullWidth>
              Add more details
              {filledMoreCount > 0 && ` (${filledMoreCount} filled in)`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: AutosaveState; onRetry: () => void }) {
  const message = saveStatusMessage(state);

  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)] bg-[var(--color-warn-soft)] p-3"
      >
        <span className="text-sm font-medium">
          Could not save — your changes are still here.
        </span>
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <p
      // Polite, not assertive: this must not interrupt a screen reader
      // mid-field on every keystroke.
      aria-live="polite"
      className="h-5 text-sm text-[var(--color-ink-soft)]"
    >
      {message}
    </p>
  );
}

function Field({
  field,
  value,
  onChange,
  onBlur,
  autoFocus,
}: {
  field: FieldSpec;
  value: FormValue;
  onChange: (value: FormValue) => void;
  onBlur: () => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const [revealed, setRevealed] = useState(false);

  const describedBy = field.help ? helpId : undefined;

  const inputClass =
    'min-h-[var(--spacing-touch)] w-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4';

  const shared = {
    id,
    onBlur,
    autoFocus,
    'aria-describedby': describedBy,
    placeholder: field.placeholder,
  } as const;

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="font-semibold">
        {field.label}
        {field.secret && (
          <span className="ml-2 align-middle text-xs font-normal text-[var(--color-ink-soft)]">
            Encrypted
          </span>
        )}
      </label>

      {field.help && (
        <p id={helpId} className="text-sm text-[var(--color-ink-soft)]">
          {field.help}
        </p>
      )}

      {field.kind === 'textarea' ? (
        <textarea
          {...shared}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className={`${inputClass} py-3`}
        />
      ) : field.kind === 'select' ? (
        <select
          {...shared}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        >
          <option value="">Choose one</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.kind === 'boolean' ? (
        <input
          {...shared}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="size-6 accent-[var(--color-accent)]"
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              {...shared}
              type={inputTypeFor(field, revealed)}
              inputMode={inputModeFor(field)}
              autoComplete={field.secret ? 'off' : undefined}
              list={field.kind === 'combo' ? `${id}-options` : undefined}
              value={String(value)}
              onChange={(event) => onChange(event.target.value)}
              className={`${inputClass} ${field.secret ? 'font-mono' : ''}`}
            />
            {field.secret && (
              <>
                <button
                  type="button"
                  onClick={() => setRevealed((current) => !current)}
                  className="shrink-0 text-sm font-medium text-[var(--color-accent)] hover:underline"
                >
                  {revealed ? 'Hide' : 'Show'}
                </button>
                {/* Reading a number out of a form is the whole reason someone
                    opened this record. Copy belongs next to it. */}
                <CopyButton value={String(value)} label={field.label} />
              </>
            )}
          </div>

          {/* Suggestions the user can ignore. "Pick one or type your own"
              breaks the moment someone needs a chimney sweep. */}
          {field.kind === 'combo' && (
            <datalist id={`${id}-options`}>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value} />
              ))}
            </datalist>
          )}
        </>
      )}
    </div>
  );
}

function inputTypeFor(field: FieldSpec, revealed: boolean): string {
  if (field.secret) return revealed ? 'text' : 'password';
  switch (field.kind) {
    case 'date':
      return 'date';
    case 'email':
      return 'email';
    case 'phone':
      return 'tel';
    case 'url':
      return 'url';
    default:
      return 'text';
  }
}

function inputModeFor(field: FieldSpec): React.HTMLAttributes<HTMLInputElement>['inputMode'] {
  switch (field.kind) {
    case 'phone':
      return 'tel';
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'money':
    case 'number':
      return 'decimal';
    default:
      return undefined;
  }
}
