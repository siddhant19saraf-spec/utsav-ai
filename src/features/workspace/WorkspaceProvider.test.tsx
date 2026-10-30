import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { formatMoney, rupees } from '@/lib/money';
import { makeBudget, makeCategory, makeEvent, makeWorkspace } from '@/test/fixtures';
import { WorkspaceProvider } from './WorkspaceProvider';
import { useWorkspace } from './workspaceContext';
import {
  WORKSPACE_STORAGE_KEY,
  parseStoredWorkspace,
  saveWorkspaceToStorage,
} from './workspaceStorage';

function BudgetProbe() {
  const { workspace, persistence, updateBudgetTotal } = useWorkspace();
  const event = workspace.events[0];

  if (!event) {
    return <p>No events</p>;
  }

  return (
    <div>
      <p data-testid="total">{formatMoney(event.budget.totalAvailable)}</p>
      <p data-testid="persistence">{persistence.status}</p>
      <p data-testid="message">{persistence.message}</p>
      <p data-testid="event-count">{workspace.events.length}</p>
      <button
        type="button"
        onClick={() => updateBudgetTotal(event.id, rupees(2_000))}
      >
        Raise total
      </button>
    </div>
  );
}

describe('WorkspaceProvider persistence', () => {
  it('loads saved budget data and writes budget edits back to storage', async () => {
    const user = userEvent.setup();
    const event = makeEvent({
      id: 'wedding',
      budget: makeBudget({
        eventId: 'wedding',
        totalAvailable: rupees(1_000),
        categories: [makeCategory({ id: 'venue', planned: rupees(100) })],
      }),
    });

    expect(
      saveWorkspaceToStorage(makeWorkspace({ events: [event] })),
    ).toEqual({ ok: true });

    render(
      <WorkspaceProvider>
        <BudgetProbe />
      </WorkspaceProvider>,
    );

    expect(screen.getByTestId('total')).toHaveTextContent('₹1,000');
    expect(screen.getByTestId('persistence')).toHaveTextContent('local');

    await user.click(screen.getByRole('button', { name: 'Raise total' }));

    expect(screen.getByTestId('total')).toHaveTextContent('₹2,000');

    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = parseStoredWorkspace(raw ?? '');

    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.workspace.events[0]?.budget.totalAvailable).toEqual(rupees(2_000));
      expect(parsed.workspace.events[0]?.budget.categories).toEqual([
        makeCategory({ id: 'venue', planned: rupees(100) }),
      ]);
    }
  });

  it('keeps an edit in memory and reports save-failed when storage rejects the write', async () => {
    const user = userEvent.setup();
    const event = makeEvent({
      id: 'wedding',
      budget: makeBudget({
        eventId: 'wedding',
        totalAvailable: rupees(1_000),
        categories: [makeCategory({ id: 'venue', planned: rupees(100) })],
      }),
    });

    expect(
      saveWorkspaceToStorage(makeWorkspace({ events: [event] })),
    ).toEqual({ ok: true });

    render(
      <WorkspaceProvider>
        <BudgetProbe />
      </WorkspaceProvider>,
    );

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    try {
      await user.click(screen.getByRole('button', { name: 'Raise total' }));
    } finally {
      setItem.mockRestore();
    }

    expect(screen.getByTestId('total')).toHaveTextContent('₹2,000');
    expect(screen.getByTestId('persistence')).toHaveTextContent('save-failed');
    expect(screen.getByTestId('message')).toHaveTextContent(/local storage is full/i);

    const parsed = parseStoredWorkspace(
      window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? '',
    );

    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.workspace.events[0]?.budget.totalAvailable).toEqual(rupees(1_000));
    }
  });

  it('falls back to a labelled sample workspace and reports malformed saved data', () => {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, '{not json');

    render(
      <WorkspaceProvider>
        <BudgetProbe />
      </WorkspaceProvider>,
    );

    expect(screen.getByTestId('persistence')).toHaveTextContent('load-failed');
    expect(screen.getByTestId('message')).toHaveTextContent(/not valid JSON/i);
    expect(
      Number(screen.getByTestId('event-count').textContent),
    ).toBeGreaterThan(0);
    expect(window.localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe('{not json');
  });
});
