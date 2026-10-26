import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { AppLayout } from './AppLayout';

function renderLayout(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ThemeProvider>
        <WorkspaceProvider>
          <AppLayout />
        </WorkspaceProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('AppLayout persistence notice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces unavailable local storage on every page', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    renderLayout();

    expect(screen.getByRole('alert')).toHaveTextContent(
      /local saving is unavailable/i,
    );
    expect(
      screen.getByRole('link', {
        name: /review storage status and export a backup/i,
      }),
    ).toHaveAttribute('href', '/settings');
  });

  it('leaves Settings to show its own detailed storage panel', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    renderLayout(['/settings']);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders no notice while browser saving works', () => {
    renderLayout();

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
