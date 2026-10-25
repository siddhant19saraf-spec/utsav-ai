import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import {
  makeActivity,
  makeBudget,
  makeCateringEstimate,
  makeCategory,
  makeEvent,
  makeGuest,
  makeTask,
  makeWorkspace,
} from '@/test/fixtures';
import { EMPTY_WORKSPACE } from '@/features/workspace/demoData';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { DashboardPage } from './DashboardPage';

function renderDashboard(initialState?: Workspace) {
  return render(
    <MemoryRouter>
      <WorkspaceProvider {...(initialState ? { initialState } : {})}>
        <DashboardPage />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

function summaryValue(label: string): string | null {
  const labelNode = screen.getByText(label);
  const card = labelNode.closest('.surface-card');

  if (!(card instanceof HTMLElement)) {
    throw new Error(`Expected a summary card for “${label}”.`);
  }

  return card.querySelectorAll('p')[1]?.textContent ?? null;
}

function metricsWorkspace(): Workspace {
  return makeWorkspace({
    events: [
      makeEvent({
        id: 'alpha',
        name: 'Alpha Wedding',
        startsAt: '2099-06-01',
        expectedGuests: 100,
        budget: makeBudget({
          eventId: 'alpha',
          totalAvailable: rupees(1_00_000),
          categories: [
            makeCategory({
              id: 'alpha-venue',
              name: 'Venue',
              planned: rupees(50_000),
              flexibility: { mode: 'protected' },
            }),
            makeCategory({
              id: 'alpha-catering',
              name: 'Catering',
              planned: rupees(30_000),
              flexibility: { mode: 'flexible', minimumPlanned: rupees(20_000) },
            }),
          ],
        }),
      }),
      makeEvent({
        id: 'beta',
        name: 'Beta Birthday',
        startsAt: '2099-07-01',
        expectedGuests: 20,
        budget: makeBudget({
          eventId: 'beta',
          totalAvailable: rupees(50_000),
          categories: [
            makeCategory({
              id: 'beta-decor',
              name: 'Décor',
              planned: rupees(20_000),
              flexibility: { mode: 'flexible', minimumPlanned: rupees(10_000) },
            }),
          ],
        }),
      }),
    ],
    tasks: [
      makeTask({
        id: 'alpha-overdue',
        eventId: 'alpha',
        title: 'Book florist',
        dueDate: '2000-01-01',
        priority: 'high',
        status: 'open',
      }),
      makeTask({
        id: 'alpha-done',
        eventId: 'alpha',
        title: 'Send invites',
        dueDate: '2099-05-01',
        status: 'completed',
      }),
      makeTask({
        id: 'beta-open',
        eventId: 'beta',
        title: 'Order cake',
        dueDate: '2099-06-15',
        status: 'open',
      }),
    ],
    guests: [
      makeGuest({ id: 'a-1', eventId: 'alpha', name: 'Ananya', rsvp: 'confirmed' }),
      makeGuest({ id: 'a-2', eventId: 'alpha', name: 'Bhavna', rsvp: 'confirmed' }),
      makeGuest({ id: 'a-3', eventId: 'alpha', name: 'Chirag', rsvp: 'pending' }),
      makeGuest({ id: 'a-4', eventId: 'alpha', name: 'Diya', rsvp: 'declined' }),
      makeGuest({ id: 'b-1', eventId: 'beta', name: 'Esha', rsvp: 'confirmed' }),
      makeGuest({ id: 'b-2', eventId: 'beta', name: 'Farah', rsvp: 'pending' }),
      makeGuest({ id: 'b-3', eventId: 'beta', name: 'Gita', rsvp: 'pending' }),
    ],
    activities: [
      makeActivity({
        id: 'alpha-haldi',
        eventId: 'alpha',
        title: 'Alpha Haldi',
        startsAt: '2099-06-01T10:00',
        endsAt: '2099-06-01T11:00',
      }),
      makeActivity({
        id: 'beta-cake',
        eventId: 'beta',
        title: 'Beta Cake',
        startsAt: '2099-07-01T09:00',
        endsAt: '2099-07-01T10:00',
      }),
      makeActivity({
        id: 'alpha-past',
        eventId: 'alpha',
        title: 'Alpha Past',
        startsAt: '2000-01-01T10:00',
        endsAt: '2000-01-01T11:00',
      }),
    ],
    cateringEstimates: [
      makeCateringEstimate({
        eventId: 'alpha',
        perPersonCost: rupees(1_000),
        bufferPercent: 10,
      }),
    ],
  });
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
      makeEvent({
        id: 'beta',
        name: 'Beta Birthday',
        startsAt: '2099-07-01',
        venue: 'Beta Hall',
        setting: 'indoor',
        expectedGuests: 10,
        budget: makeBudget({
          id: 'budget-beta',
          eventId: 'beta',
          totalAvailable: rupees(50_000),
        }),
      }),
    ],
    tasks: [
      makeTask({
        id: 'alpha-overdue',
        eventId: 'alpha',
        title: 'Book florist',
        dueDate: '2000-01-01',
        priority: 'medium',
        status: 'open',
      }),
    ],
  });
}

function quietWorkspace(): Workspace {
  return makeWorkspace({
    events: [
      makeEvent({
        id: 'quiet',
        name: 'Quiet Celebration',
        startsAt: '2099-08-01',
        venue: 'Quiet Hall',
        setting: 'indoor',
        expectedGuests: 10,
        budget: makeBudget({
          id: 'budget-quiet',
          eventId: 'quiet',
          totalAvailable: rupees(50_000),
        }),
      }),
    ],
  });
}

describe('DashboardPage', () => {
  it('completes a task and updates progress and the live announcement', async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(screen.getByText('3 of 9 tasks complete')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', {
      name: 'Confirm catering menu tasting',
    });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(screen.getByText('4 of 9 tasks complete')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /completed .*confirm catering menu tasting/i,
    );
  });

  it('filters the task list by open and completed state', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const filterGroup = screen.getByRole('group', { name: 'Filter tasks' });

    await user.click(within(filterGroup).getByRole('button', { name: 'Open' }));

    expect(
      screen.queryByRole('checkbox', { name: 'Share save-the-dates' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Confirm catering menu tasting' }),
    ).toBeInTheDocument();

    await user.click(within(filterGroup).getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('checkbox', { name: 'Share save-the-dates' })).toBeChecked();
    expect(
      screen.queryByRole('checkbox', { name: 'Confirm catering menu tasting' }),
    ).not.toBeInTheDocument();
  });

  it('focuses budgets and tasks on a selected event', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      screen.getByRole('button', { name: /focus budgets and tasks on meera/i }),
    );

    expect(screen.getByLabelText('Focus event')).toHaveValue('sample-meera-birthday');
    expect(screen.getByText('1 of 3 tasks complete')).toBeInTheDocument();
    expect(
      screen.getByText(/planned expenditure exceeds the budget by ₹60,000/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /meera.*selected for budgets and tasks/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryByRole('checkbox', { name: 'Confirm catering menu tasting' }),
    ).not.toBeInTheDocument();
  });

  it('validates the create-event dialog and adds a session event', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole('button', { name: 'Create event' }));

    const dialog = screen.getByRole('dialog', { name: 'Create a new event' });
    const nameInput = within(dialog).getByLabelText('Event name');
    expect(nameInput).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: 'Create event' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /please fix the highlighted fields/i,
    );
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveFocus();

    await user.type(nameInput, 'Diwali Housewarming');
    await user.type(within(dialog).getByLabelText('Expected guests'), '60');
    await user.type(within(dialog).getByLabelText('Budget (INR)'), '5,00,000');

    await user.click(within(dialog).getByRole('button', { name: 'Create event' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /created diwali housewarming.*saved in this browser/i,
    );
    expect(screen.getByRole('option', { name: 'Diwali Housewarming' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Diwali Housewarming' }),
    ).toBeInTheDocument();
  });

  it('closes the dialog with Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const createButton = screen.getByRole('button', { name: 'Create event' });
    await user.click(createButton);
    expect(screen.getByRole('dialog', { name: 'Create a new event' })).toBeInTheDocument();
    expect(screen.getByLabelText('Event name')).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createButton).toHaveFocus();
  });

  it('removes sample data into an honest empty state and can restore it', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole('button', { name: 'Remove sample data' }));

    expect(
      screen.getByRole('heading', { name: 'Your first celebration starts here' }),
    ).toBeInTheDocument();
    const notice = screen.getByLabelText('Sample data status');
    expect(notice).toHaveTextContent(/sample data is out of view/i);
    expect(
      screen.queryByRole('heading', { name: 'Ananya & Rohan’s Wedding' }),
    ).not.toBeInTheDocument();

    await user.click(within(notice).getByRole('button', { name: 'Add sample data' }));

    expect(
      screen.getByRole('heading', { name: 'Ananya & Rohan’s Wedding' }),
    ).toBeInTheDocument();
  });

  it('shows a useful zero-data dashboard for an empty workspace', () => {
    renderDashboard(EMPTY_WORKSPACE);

    expect(
      screen.getByRole('heading', { name: 'Your first celebration starts here' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No events yet')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Planning task completion' }),
    ).toHaveAttribute('aria-valuetext', '0 of 0 tasks complete');
    expect(screen.getByLabelText('Sample data status')).toHaveTextContent(
      /sample data is out of view/i,
    );
  });

  it('derives activity, task, guest, and catering metrics from workspace state', async () => {
    const user = userEvent.setup();
    renderDashboard(metricsWorkspace());

    expect(summaryValue('Overdue tasks')).toBe('1');
    expect(summaryValue('Task completion')).toBe('33%');
    expect(summaryValue('Confirmed RSVPs')).toBe('3');
    expect(screen.getByText('1 of 3 tasks in All events')).toBeInTheDocument();
    expect(screen.getByText('3 pending · 7 invited')).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 event configured · uses confirmed RSVPs where guest records exist.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Alpha Haldi')).toBeInTheDocument();
    expect(screen.getByText('Beta Cake')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Past')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Focus event'), 'alpha');

    expect(summaryValue('Task completion')).toBe('50%');
    expect(screen.getByText('1 of 2 tasks in Alpha Wedding')).toBeInTheDocument();
    expect(summaryValue('Confirmed RSVPs')).toBe('2');
    expect(screen.getByText('1 pending · 4 invited')).toBeInTheDocument();
    expect(summaryValue('Overdue tasks')).toBe('1');
    expect(screen.getByText('Alpha Haldi')).toBeInTheDocument();
    expect(screen.queryByText('Beta Cake')).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Book florist' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Order cake' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage timeline/i })).toHaveAttribute(
      'href',
      '/timeline?event=alpha',
    );
    expect(screen.getByRole('link', { name: /manage guests/i })).toHaveAttribute(
      'href',
      '/guests?event=alpha',
    );
    expect(
      screen.getByRole('link', { name: /manage tasks and schedule/i }),
    ).toHaveAttribute('href', '/timeline?event=alpha');
  });

  it('shows useful empty states for an event without activities, tasks, or guests', () => {
    const event = makeEvent({
      id: 'empty-event',
      name: 'Quiet Event',
      startsAt: '2099-05-01',
      expectedGuests: 0,
      budget: makeBudget({
        eventId: 'empty-event',
        totalAvailable: rupees(10_000),
      }),
    });
    renderDashboard(makeWorkspace({ events: [event] }));

    expect(summaryValue('Pending tasks')).toBe('0');
    expect(screen.getByText('Everything is up to date')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'No upcoming activities' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add an activity' })).toHaveAttribute(
      'href',
      '/timeline',
    );
    expect(
      screen.getByText(
        'New events start without tasks. Add preparation work in the Timeline — due dates and priorities are saved in this browser.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('0 pending · 0 invited')).toBeInTheDocument();
    expect(
      screen.queryByText(/No RSVPs are confirmed yet/),
    ).not.toBeInTheDocument();
    const guestSection = screen.getByRole('region', {
      name: 'Guests and catering',
    });
    expect(within(guestSection).getByText('Not configured')).toBeInTheDocument();
    expect(
      within(guestSection).getByText(
        'No per-person catering assumption is saved. Set one in Guests; no price is invented for you.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage timeline/i })).toHaveAttribute(
      'href',
      '/timeline',
    );
    expect(screen.getByRole('link', { name: /manage guests/i })).toHaveAttribute(
      'href',
      '/guests',
    );
  });

  it('shows risk early warnings and links them to event-scoped findings', async () => {
    const user = userEvent.setup();
    renderDashboard(riskWorkspace());

    const riskSection = screen.getByRole('region', { name: 'Early warnings' });

    expect(
      within(riskSection).getByText(
        /2 open findings for All events · 1 critical · 0 high/,
      ),
    ).toBeInTheDocument();
    expect(
      within(riskSection).getByRole('link', {
        name: 'Planned spending exceeds the total budget',
      }),
    ).toHaveAttribute('href', '/risks?event=alpha');
    expect(
      within(riskSection).getByRole('link', { name: '1 overdue task' }),
    ).toHaveAttribute('href', '/risks?event=alpha');
    expect(
      within(riskSection).getByRole('link', { name: /Review risk findings/ }),
    ).toHaveAttribute('href', '/risks');
    expect(
      screen.getByRole('link', {
        name: '2 open risk findings for Alpha Wedding. Review in Risk Intelligence.',
      }),
    ).toHaveAttribute('href', '/risks?event=alpha');
    expect(
      screen.queryByRole('link', { name: /open risk findings? for Beta Birthday/ }),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Focus event'), 'alpha');

    expect(
      within(riskSection).getByText(/2 open findings for Alpha Wedding/),
    ).toBeInTheDocument();
    expect(
      within(riskSection).getByRole('link', { name: /Review risk findings/ }),
    ).toHaveAttribute('href', '/risks?event=alpha');
  });

  it('states when no open findings exist without inventing a risk', () => {
    renderDashboard(quietWorkspace());

    const riskSection = screen.getByRole('region', { name: 'Early warnings' });

    expect(
      within(riskSection).getByText(
        'No open deterministic findings for All events. Checks run again after every saved change.',
      ),
    ).toBeInTheDocument();
    expect(
      within(riskSection).getByText(/No open findings are recorded for this focus/),
    ).toBeInTheDocument();
    expect(
      within(riskSection).queryByRole('listitem'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /open risk finding/ }),
    ).not.toBeInTheDocument();
  });
});
