import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Workspace } from '@/types/domain';
import { makeEvent, makeWorkspace } from '@/test/fixtures';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { useSelectedEvent } from './useSelectedEvent';

function SelectionProbe() {
  const { selectedEvent, handleEventChange } = useSelectedEvent();
  const location = useLocation();
  const navigationType = useNavigationType();

  return (
    <div>
      <p data-testid="selected">{selectedEvent?.id ?? 'none'}</p>
      <p data-testid="search">{location.search}</p>
      <p data-testid="navigation-type">{navigationType}</p>
      <button type="button" onClick={() => handleEventChange('birthday')}>
        Select birthday
      </button>
    </div>
  );
}

function createWorkspace(): Workspace {
  return makeWorkspace({
    events: [
      makeEvent({ id: 'wedding', name: 'Wedding' }),
      makeEvent({ id: 'birthday', name: 'Birthday' }),
    ],
  });
}

function renderProbe(entry: string, workspace: Workspace = createWorkspace()) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <WorkspaceProvider initialState={workspace}>
        <SelectionProbe />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

describe('useSelectedEvent', () => {
  it('selects the event named by the event query parameter', () => {
    renderProbe('/budget?event=birthday');

    expect(screen.getByTestId('selected')).toHaveTextContent('birthday');
  });

  it('falls back to the first event when the parameter is missing or unknown', () => {
    const { unmount } = renderProbe('/budget');

    expect(screen.getByTestId('selected')).toHaveTextContent('wedding');

    unmount();
    renderProbe('/budget?event=missing');

    expect(screen.getByTestId('selected')).toHaveTextContent('wedding');
  });

  it('returns no selection when the workspace has no events', () => {
    renderProbe('/budget?event=wedding', makeWorkspace());

    expect(screen.getByTestId('selected')).toHaveTextContent('none');
  });

  it('sets the event parameter, preserves other parameters, and replaces history', async () => {
    const user = userEvent.setup();
    renderProbe('/budget?event=wedding&view=compact');

    expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP');

    await user.click(screen.getByRole('button', { name: 'Select birthday' }));

    expect(screen.getByTestId('selected')).toHaveTextContent('birthday');
    expect(screen.getByTestId('search')).toHaveTextContent(
      '?event=birthday&view=compact',
    );
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
  });
});
