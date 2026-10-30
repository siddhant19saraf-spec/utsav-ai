import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalDialog } from './ModalDialog';

function renderDialog(onClose: () => void, focusFirstButton = false) {
  function Harness() {
    const initialFocusRef = useRef<HTMLButtonElement>(null);

    return (
      <ModalDialog
        open
        eyebrow="Test dialog"
        title="Confirm something"
        description="A short description for assistive technology."
        onClose={onClose}
        {...(focusFirstButton ? { initialFocusRef } : {})}
      >
        <button ref={initialFocusRef} type="button">
          First action
        </button>
        <button type="button">Last action</button>
      </ModalDialog>
    );
  }

  return render(<Harness />);
}

describe('ModalDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('labels the dialog and focuses the first focusable control', () => {
    renderDialog(vi.fn());

    const dialog = screen.getByRole('dialog', { name: 'Confirm something' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(
      'A short description for assistive technology.',
    );
    expect(
      screen.getByRole('button', { name: 'Close Confirm something' }),
    ).toHaveFocus();
  });

  it('honours the initial focus ref when provided', () => {
    renderDialog(vi.fn(), true);

    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog(onClose);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab focus inside the dialog', async () => {
    const user = userEvent.setup();
    renderDialog(vi.fn());

    const closeButton = screen.getByRole('button', {
      name: 'Close Confirm something',
    });
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
  });

  it('closes when the backdrop itself is pressed, not the dialog body', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog(onClose);

    const dialog = screen.getByRole('dialog');
    await user.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores body scrolling and focus after unmount', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const { unmount } = renderDialog(vi.fn());
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
