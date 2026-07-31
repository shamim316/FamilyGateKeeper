// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoveryKitStep } from './recovery-kit-step';
import { recoveryCodeGroups } from '@/lib/vault/recovery-kit';

const CODE = 'FGK1-4TQ9M-XK2WP-7HZR3-BN5VD-2GKQW-8MXTZ-5PJH4-9WRNC-3TVQ6-6KDYM';
const GROUPS = recoveryCodeGroups(CODE);

/** Reads which group the screen is asking for out of the field's label. */
function challengedGroupIndex(): number {
  const ordinals = [
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
  const label = screen.getByText(/Type the \w+ group/).textContent ?? '';
  const found = ordinals.findIndex((ordinal) => label.includes(ordinal));
  if (found === -1) throw new Error(`Could not read the challenge from "${label}"`);
  return found;
}

function renderKit(onDone = vi.fn()) {
  render(<RecoveryKitStep code={CODE} familyName="Whitfield" onDone={onDone} />);
  return { onDone };
}

beforeEach(() => {
  // jsdom implements neither, and the kit offers both.
  window.print = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:kit');
  URL.revokeObjectURL = vi.fn();
});

describe('the recovery kit screen', () => {
  it('shows the whole code so it can be written down', () => {
    renderKit();
    for (const group of GROUPS) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });

  it('says plainly what happens if it is lost', () => {
    renderKit();
    expect(screen.getByText(/gone for good/i)).toBeInTheDocument();
  });

  it('will not continue on the checkbox alone', async () => {
    const user = userEvent.setup();
    const { onDone } = renderKit();

    await user.click(screen.getByLabelText(/saved this code somewhere safe/i));

    const button = screen.getByRole('button', { name: /open my vault/i });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('will not continue on the typed group alone', async () => {
    const user = userEvent.setup();
    const { onDone } = renderKit();

    await user.type(screen.getByRole('textbox'), GROUPS[challengedGroupIndex()]);

    expect(screen.getByRole('button', { name: /open my vault/i })).toBeDisabled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('rejects the wrong group', async () => {
    const user = userEvent.setup();
    const { onDone } = renderKit();

    const wrong = GROUPS[(challengedGroupIndex() + 1) % GROUPS.length];
    await user.click(screen.getByLabelText(/saved this code somewhere safe/i));
    await user.type(screen.getByRole('textbox'), wrong);

    expect(screen.getByRole('button', { name: /open my vault/i })).toBeDisabled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('continues once both are done', async () => {
    const user = userEvent.setup();
    const { onDone } = renderKit();

    await user.click(screen.getByLabelText(/saved this code somewhere safe/i));
    await user.type(screen.getByRole('textbox'), GROUPS[challengedGroupIndex()]);

    const button = screen.getByRole('button', { name: /open my vault/i });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('accepts the group however it was typed off the printed sheet', async () => {
    const user = userEvent.setup();
    const { onDone } = renderKit();

    await user.click(screen.getByLabelText(/saved this code somewhere safe/i));
    await user.type(screen.getByRole('textbox'), ` ${GROUPS[challengedGroupIndex()].toLowerCase()} `);

    await user.click(screen.getByRole('button', { name: /open my vault/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('never asks for the first group', () => {
    // Glanced at while reading the code, so it proves the least. Rendered
    // repeatedly because the choice is random.
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const { unmount } = render(
        <RecoveryKitStep code={CODE} familyName="Whitfield" onDone={vi.fn()} />,
      );
      expect(challengedGroupIndex()).toBeGreaterThan(0);
      unmount();
    }
  });

  it('offers a download named something findable a year later', async () => {
    const user = userEvent.setup();
    renderKit();

    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });

    await user.click(screen.getByRole('button', { name: /download it/i }));

    expect(clicks[0]).toMatch(/^gate-keeper-recovery-whitfield-\d{4}-\d{2}-\d{2}\.txt$/);
  });
});
