import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { exportWorkspaceToJson } from '@/features/workspace/workspaceStorage';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { makeBudget, makeEvent, makeWorkspace } from '@/test/fixtures';
import { SettingsPage } from './SettingsPage';

function currentWorkspace(): Workspace {
  return makeWorkspace({
    events: [
      makeEvent({
        id: 'current-event',
        name: 'Current Celebration',
        startsAt: '2099-06-01',
        expectedGuests: 10,
        setting: 'indoor',
        venue: 'Current Hall',
        budget: makeBudget({
          id: 'budget-current',
          eventId: 'current-event',
          totalAvailable: rupees(10_000),
        }),
      }),
    ],
  });
}

function importWorkspaceJson(): string {
  const result = exportWorkspaceToJson(
    makeWorkspace({
      events: [
        makeEvent({
          id: 'imported-event',
          name: 'Imported Gala',
          startsAt: '2099-09-01',
          expectedGuests: 10,
          setting: 'indoor',
          venue: 'Imported Hall',
          budget: makeBudget({
            id: 'budget-imported',
            eventId: 'imported-event',
            totalAvailable: rupees(25_000),
          }),
        }),
      ],
    }),
  );

  if (!result.ok) {
    throw new Error('Expected the fixture workspace to export.');
  }

  return result.json;
}

function WorkspaceProbe() {
  const { workspace } = useWorkspace();

  return (
    <p data-testid="workspace-probe">
      {workspace.events.map((event) => event.name).join(', ') || 'No events'}
    </p>
  );
}

function renderSettings(initialState: Workspace = currentWorkspace()) {
  return render(
    <MemoryRouter>
      <WorkspaceProvider initialState={initialState}>
        <SettingsPage />
        <WorkspaceProbe />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

afterEach(() => {
  vi.restoreAllMocks();

  if (originalCreateObjectUrl) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectUrl,
    });
  } else {
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  }

  if (originalRevokeObjectUrl) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  } else {
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
  }
});

describe('SettingsPage backup and restore', () => {
  it('exports the current workspace as a downloaded JSON file', async () => {
    const user = userEvent.setup();
    let exportedBlob: Blob | null = null;
    const createObjectUrl = vi.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:workspace-backup';
    });

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    renderSettings();

    await user.click(screen.getByRole('button', { name: 'Export workspace' }));

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(exportedBlob).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(/Workspace backup downloaded/);
    expect(screen.getByTestId('workspace-probe')).toHaveTextContent('Current Celebration');
  });

  it('rejects a malformed import without changing the current workspace', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.upload(
      screen.getByLabelText('Workspace JSON file to import'),
      new File(['{"version":1,"workspace":{"events":"not-an-array"}}'], 'broken.json', {
        type: 'application/json',
      }),
    );

    const alert = screen.getByRole('alert');

    expect(alert).toHaveTextContent(/could not be imported/i);
    expect(alert).toHaveTextContent('Nothing was changed.');
    expect(
      screen.queryByRole('group', { name: /Replace this browser/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-probe')).toHaveTextContent('Current Celebration');
  });

  it('previews a valid import and leaves data unchanged when cancelled', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.upload(
      screen.getByLabelText('Workspace JSON file to import'),
      new File([importWorkspaceJson()], 'backup.json', { type: 'application/json' }),
    );

    const confirmation = screen.getByRole('group', {
      name: 'Replace this browser’s workspace?',
    });

    expect(confirmation).toHaveTextContent('backup.json');
    expect(confirmation).toHaveTextContent('1 event');
    expect(confirmation).toHaveTextContent('0 risk findings');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('group', { name: 'Replace this browser’s workspace?' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-probe')).toHaveTextContent('Current Celebration');
  });

  it('replaces the workspace only after explicit confirmation', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.upload(
      screen.getByLabelText('Workspace JSON file to import'),
      new File([importWorkspaceJson()], 'backup.json', { type: 'application/json' }),
    );
    await user.click(screen.getByRole('button', { name: 'Replace my workspace' }));

    expect(screen.getByTestId('workspace-probe')).toHaveTextContent('Imported Gala');
    expect(screen.getByRole('status')).toHaveTextContent(
      /Imported backup.json.*previous workspace.*was replaced/,
    );
    expect(
      screen.queryByRole('group', { name: 'Replace this browser’s workspace?' }),
    ).not.toBeInTheDocument();
  });
});
