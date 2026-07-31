'use client';

/**
 * The recovery kit ceremony.
 *
 * The one screen in this app where friction is the feature. Losing both the
 * passphrase and this code means the data is gone — no reset, no support
 * ticket, nothing anyone can do. A checkbox on its own gets ticked without
 * reading, so this also asks for one group back before it will let anyone
 * continue.
 */

import { useMemo, useState } from 'react';
import {
  chooseChallengeIndex,
  isChallengeAnswerCorrect,
  recoveryCodeGroups,
  recoveryKitFilename,
  recoveryKitText,
} from '@/lib/vault/recovery-kit';
import { Button, Callout, Checkbox, ErrorMessage, TextField } from '@/components/ui';

const ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];

export function RecoveryKitStep({
  code,
  familyName,
  onDone,
}: {
  code: string;
  familyName: string;
  onDone: () => void;
}) {
  const groups = useMemo(() => recoveryCodeGroups(code), [code]);
  const challengeIndex = useMemo(() => chooseChallengeIndex(groups.length), [groups.length]);

  const [saved, setSaved] = useState(false);
  const [answer, setAnswer] = useState('');
  const [attempted, setAttempted] = useState(false);

  const answerCorrect = isChallengeAnswerCorrect(code, challengeIndex, answer);
  const canContinue = saved && answerCorrect;

  function download() {
    const text = recoveryKitText({ code, familyName, createdOn: new Date() });
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = recoveryKitFilename(familyName, new Date());
    link.click();

    URL.revokeObjectURL(url);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (canContinue) onDone();
  }

  return (
    <div className="grid gap-7">
      <Callout tone="danger" title="This is the only other way into your vault">
        If you forget your passphrase, this code is what gets you back in. Lose both and your
        information is gone for good — we store only scrambled text and cannot read or reset it.
      </Callout>

      <div>
        <p className="font-semibold">Your recovery code</p>
        <div className="mt-2 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <p className="font-mono text-lg leading-relaxed tracking-wider break-all select-all">
            <span className="text-[var(--color-ink-soft)]">FGK1-</span>
            {groups.map((group, index) => (
              <span key={index}>
                {group}
                {index < groups.length - 1 && (
                  <span className="text-[var(--color-ink-soft)]">-</span>
                )}
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className="no-print flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => window.print()} type="button">
          Print it
        </Button>
        <Button variant="secondary" onClick={download} type="button">
          Download it
        </Button>
      </div>

      <Callout title="Where to put it">
        Somewhere physical: a filing cabinet, a home safe, or with your will. Not in your email, and
        not in a note on the same phone you unlock this with. Anyone holding it can open your vault,
        so treat it like a spare key to your house.
      </Callout>

      <form onSubmit={submit} className="no-print grid gap-6">
        <Checkbox
          checked={saved}
          onChange={setSaved}
          label="I have saved this code somewhere safe."
        />

        <div className="border-t border-[var(--color-line)] pt-6">
          <TextField
            label={`Type the ${ORDINALS[challengeIndex] ?? `${challengeIndex + 1}th`} group`}
            hint="Just to be certain it really is written down somewhere. Not case sensitive."
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono tracking-widest uppercase"
            placeholder={'•'.repeat(5)}
            error={attempted && !answerCorrect ? 'That does not match. Check the code above.' : null}
          />
        </div>

        {attempted && !saved && <ErrorMessage>Please confirm you have saved the code.</ErrorMessage>}

        <Button type="submit" fullWidth disabled={!canContinue}>
          I have saved it — open my vault
        </Button>
      </form>
    </div>
  );
}
