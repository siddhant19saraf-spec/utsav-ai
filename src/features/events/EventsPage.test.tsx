import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import {
  WORKSPACE_STORAGE_KEY,
  parseStoredWorkspace,
  saveWorkspaceToStorage,
} from '@/features/workspace/workspaceStorage';
import {
  makeBudget,
  makeCategory,
  makeEvent,
  makeWorkspace,
} from '@/test/fixtures';
import { EventsPage } from './EventsPage';

function renderEventsPage(initialState?: Workspace) {
  return render(
    <MemoryRouter>
      <WorkspaceProvider {...(initialState ? { initialState } : {})}>
        <EventsPage />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

function riskWorkspace(): Workspace {
  return makeWorkspace({
    events: [
      makeEvent({
        id: 'alpha',
        name: 'Alpha Wedding',
        startsAt: '2099-06-01',
        venue: 'Alpha Hall',
        setting: 'indoor',
        expectedGuests: 0,
        budget: makeBudget({
          id: 'budget-alpha',
          eventId: 'alpha',
          totalAvailable: rupees(1_000),
          categories: [
            makeCategory({
              id: 'alpha-venue',
              name: 'Venue',
              planned: { amountMinor: 1_10_000, currency: 'INR' },
              flexibility: { mode: 'flexible', minimumPlanned: rupees(1_000) },
            }),
          ],
        }),
      }),
    ],
  });
}

describe('EventsPage', () => {
  it('searches events and recovers from an empty filter result', async () => {
    const user = userEvent.setup();
    renderEventsPage();

    const search = screen.getByLabelText('Search events');
    await user.type(search, 'meera');

    expect(
      screen.getByRole('heading', { name: 'Meera’s 60th Birthday' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Ananya & Rohan’s Wedding' }),
    ).not.toBeInTheDocument();

    await user.type(search, 'no-such-event');

    expect(
      screen.getByRole('heading', { name: 'No events match your filters' }),
    ).toBeInTheDocument();

    const [clearButton] = screen.getAllByRole('button', { name: 'Clear filters' });

    if (!clearButton) {
      throw new Error('Expected a clear filters button.');
    }

    await user.click(clearButton);

    expect(screen.getByRole('heading', { name: 'Ananya & Rohan’s Wedding' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search events')).toHaveValue('');
  });

  it('filters events by planning status', async () => {
    const user = userEvent.setup();
    renderEventsPage();

    await user.selectOptions(screen.getByLabelText('Planning status'), 'completed');

    expect(screen.getByRole('heading', { name: 'Sundar Family Diwali' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Meera’s 60th Birthday' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Acme Annual Gala' }),
    ).not.toBeInTheDocument();
  });

  it('links an event risk badge to the scoped risk review', () => {
    renderEventsPage(riskWorkspace());

    expect(screen.getByRole('heading', { name: 'Alpha Wedding' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: '1 open risk finding for Alpha Wedding. Review in Risk Intelligence.',
      }),
    ).toHaveAttribute('href', '/risks?event=alpha');
  });

  it('edits one event, preserves its budget data, and persists without touching another event', async () => {
    const user = userEvent.setup();
    const venueCategory = makeCategory({
      id: 'alpha-venue',
      name: 'Venue',
      planned: rupees(600),
    });
    const alpha = makeEvent({
      id: 'alpha',
      name: 'Alpha Wedding',
      startsAt: '2099-06-01',
      budget: makeBudget({
        id: 'alpha-budget',
        eventId: 'alpha',
        totalAvailable: rupees(1_000),
        categories: [venueCategory],
      }),
    });
    const beta = makeEvent({
      id: 'beta',
      name: 'Beta Birthday',
      startsAt: '2099-07-01',
      budget: makeBudget({
        id: 'beta-budget',
        eventId: 'beta',
        totalAvailable: rupees(2_000),
      }),
    });

    saveWorkspaceToStorage(makeWorkspace({ events: [alpha, beta] }));
    renderEventsPage();

    await user.click(screen.getByRole('button', { name: 'Edit Alpha Wedding' }));

    expect(screen.getByRole('heading', { name: 'Edit event' })).toBeInTheDocument();

    const name = screen.getByLabelText('Event name');
    const guests = screen.getByLabelText('Expected guests');

    expect(name).toHaveValue('Alpha Wedding');
    expect(guests).toHaveValue(100);
    expect(screen.getByLabelText('Budget (INR)')).toHaveValue('1000');

    await user.clear(name);
    await user.type(name, 'Alpha Wedding Gala');
    await user.clear(guests);
    await user.type(guests, '150');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.queryByRole('heading', { name: 'Edit event' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alpha Wedding Gala' })).toBeInTheDocument();
    expect(screen.getByText(/Updated Alpha Wedding Gala/)).toBeInTheDocument();

    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? '';
    const parsed = parseStoredWorkspace(raw);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw new Error('Expected the edited workspace to be saved.');
    }

    const storedAlpha = parsed.workspace.events.find((event) => event.id === 'alpha');
    const storedBeta = parsed.workspace.events.find((event) => event.id === 'beta');

    expect(storedAlpha).toMatchObject({
      name: 'Alpha Wedding Gala',
      expectedGuests: 150,
    });
    expect(storedAlpha?.budget.totalAvailable).toEqual(rupees(1_000));
    expect(storedAlpha?.budget.categories).toEqual([venueCategory]);
    expect(storedBeta).toEqual(beta);
  });

  it('keeps an invalid edit open without changing saved data', async () => {
    const user = userEvent.setup();
    const event = makeEvent({ id: 'alpha', name: 'Alpha Wedding', startsAt: '2099-06-01' });

    saveWorkspaceToStorage(makeWorkspace({ events: [event] }));
    renderEventsPage();

    await user.click(screen.getByRole('button', { name: 'Edit Alpha Wedding' }));

    const name = screen.getByLabelText('Event name');
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByRole('heading', { name: 'Edit event' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please fix the highlighted fields before saving the event.',
    );
    expect(name).toHaveFocus();

    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? '';
    const parsed = parseStoredWorkspace(raw);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw new Error('Expected the seeded workspace to remain valid.');
    }

    expect(parsed.workspace.events[0]?.name).toBe('Alpha Wedding');
  });

  it('allows correcting a saved past event without forcing a new date', async () => {
    const user = userEvent.setup();
    const event = makeEvent({
      id: 'past',
      name: 'Past Diwali',
      startsAt: '2020-01-01',
      status: 'completed',
    });

    renderEventsPage(makeWorkspace({ events: [event] }));

    await user.click(screen.getByRole('button', { name: 'Edit Past Diwali' }));

    expect(screen.getByLabelText('Event date')).toHaveValue('2020-01-01');

    const name = screen.getByLabelText('Event name');
    await user.clear(name);
    await user.type(name, 'Past Diwali Archive');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      screen.getByRole('heading', { name: 'Past Diwali Archive' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Choose today or a future date.')).not.toBeInTheDocument();
  });
});
