import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { makeWorkspace } from '@/test/fixtures';
import { DiagnosticsPage } from './DiagnosticsPage';

vi.mock('./serviceStatus', () => ({
  checkServices: async () => {
    throw new Error('forced probe failure');
  },
}));

function renderDiagnostics() {
  return render(
    <MemoryRouter initialEntries={['/diagnostics']}>
      <WorkspaceProvider initialState={makeWorkspace()}>
        <DiagnosticsPage />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

describe('DiagnosticsPage recovery', () => {
  it('re-enables the check after an unexpected probe failure', async () => {
    const user = userEvent.setup();
    renderDiagnostics();

    await screen.findByText(
      /service check failed before a status could be read/i,
    );

    await user.click(screen.getByRole('button', { name: 'Check services' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Check services' }),
      ).toBeEnabled();
    });
    expect(
      screen.queryByRole('button', { name: 'Checking services…' }),
    ).not.toBeInTheDocument();
  });
});
