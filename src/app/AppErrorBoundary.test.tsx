import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

let shouldCrash = true;

function UnstableView() {
  if (shouldCrash) {
    throw new Error('private-workspace-detail');
  }

  return <p>Workspace redrawn</p>;
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    shouldCrash = true;
  });

  it('shows a safe fallback without exposing the error detail and focuses the heading', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <UnstableView />
      </AppErrorBoundary>,
    );

    const heading = screen.getByRole('heading', {
      level: 1,
      name: /something went wrong while drawing this screen/i,
    });

    expect(heading).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /your saved workspace was not intentionally cleared/i,
    );
    expect(screen.queryByText(/private-workspace-detail/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it('redraws the child after the user retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <AppErrorBoundary>
        <UnstableView />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldCrash = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Workspace redrawn')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
