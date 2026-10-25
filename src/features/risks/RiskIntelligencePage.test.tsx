import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { CelebrationEvent, Workspace } from '@/types/domain';
import { EMPTY_WORKSPACE } from '@/features/workspace/demoData';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import {
  makeBudget,
  makeCategory,
  makeEvent,
  makeRiskFinding,
  makeTask,
  makeWorkspace,
} from '@/test/fixtures';
import { RiskIntelligencePage } from './RiskIntelligencePage';

function overrunEvent(): CelebrationEvent {
  const planned = 1_10_000;

  return makeEvent({
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
          planned: { amountMinor: planned, currency: 'INR' },
          flexibility: { mode: 'flexible', minimumPlanned: rupees(1_000) },
        }),
      ],
    }),
  });
}

function cleanEvent(): CelebrationEvent {
  return makeEvent({
    id: 'beta',
    name: 'Beta Birthday',
    startsAt: '2099-07-01',
    venue: 'Beta Hall',
    setting: 'indoor',
    expectedGuests: 0,
    budget: makeBudget({
      id: 'budget-beta',
      eventId: 'beta',
      totalAvailable: rupees(50_000),
    }),
  });
}

function riskWorkspace(): Workspace {
  return makeWorkspace({
    events: [overrunEvent(), cleanEvent()],
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
    riskFindings: [
      makeRiskFinding({
        id: 'risk:beta:resolved-history',
        eventId: 'beta',
        title: 'Resolved sample issue',
        status: 'resolved',
        resolvedAt: '2026-10-20T08:00:00.000Z',
      }),
      makeRiskFinding({
        id: 'risk:beta:dismissed-history',
        eventId: 'beta',
        title: 'Dismissed sample issue',
        status: 'dismissed',
        dismissedAt: '2026-10-21T08:00:00.000Z',
      }),
    ],
  });
}

function renderRiskPage(
  initialState: Workspace = riskWorkspace(),
  initialEntry = '/risks',
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WorkspaceProvider initialState={initialState}>
        <RiskIntelligencePage />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

function summaryValue(label: string): string | null {
  const card = screen.getByText(label, { selector: 'p' }).closest('.surface-card');

  if (!(card instanceof HTMLElement)) {
    throw new Error(`Expected a summary card for “${label}”.`);
  }

  return card.querySelectorAll('p')[1]?.textContent ?? null;
}

describe('RiskIntelligencePage', () => {
  it('prompts for an event instead of inventing findings in an empty workspace', () => {
    renderRiskPage(EMPTY_WORKSPACE);

    expect(
      screen.getByRole('heading', { name: 'There are no events to assess yet' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No risks detected in the saved plan')).not.toBeInTheDocument();
  });

  it('derives summary counts and evidence from saved planning data', () => {
    renderRiskPage();

    expect(
      screen.getByRole('heading', {
        name: 'See risks while there is still time to act',
      }),
    ).toBeInTheDocument();
    expect(summaryValue('Open findings')).toBe('2');
    expect(summaryValue('Critical open')).toBe('1');
    expect(summaryValue('High open')).toBe('0');
    expect(summaryValue('Resolved')).toBe('1');
    expect(
      screen.getByText('Across all events · 4 findings recorded'),
    ).toBeInTheDocument();

    const card = screen.getByRole('article', {
      name: 'Planned spending exceeds the total budget',
    });

    expect(within(card).getByText('Financial')).toBeInTheDocument();
    expect(within(card).getByText('Confirmed by saved data')).toBeInTheDocument();
    expect(within(card).getByText('Overrun share')).toBeInTheDocument();
    expect(within(card).getByText('10%')).toBeInTheDocument();
    expect(
      within(card).getByText(/Reduce planned amounts for flexible categories/),
    ).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Event budget' })).toHaveAttribute(
      'href',
      '/budget?event=alpha',
    );
    expect(within(card).getByRole('link', { name: 'Alpha Wedding' })).toHaveAttribute(
      'href',
      '/events#event-alpha',
    );
    expect(within(card).getByText(/Rule financial\.planned-overrun/)).toBeInTheDocument();
  });

  it('filters by category, severity, event, and status without inventing results', async () => {
    const user = userEvent.setup();
    renderRiskPage();

    await user.selectOptions(screen.getByLabelText('Category'), 'financial');

    expect(
      screen.getByRole('article', {
        name: 'Planned spending exceeds the total budget',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: '1 overdue task' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Category'), 'all');
    await user.selectOptions(screen.getByLabelText('Severity'), 'critical');

    expect(
      screen.getByRole('article', {
        name: 'Planned spending exceeds the total budget',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: '1 overdue task' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Severity'), 'medium');

    expect(screen.queryByRole('article', {
      name: 'Planned spending exceeds the total budget',
    })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: '1 overdue task' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Severity'), 'all');
    await user.selectOptions(screen.getByLabelText('Event'), 'beta');

    expect(
      screen.getByRole('heading', { name: 'No open findings in this view' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('For Beta Birthday · 2 findings recorded'),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'resolved');

    const resolved = screen.getByRole('article', {
      name: 'Resolved sample issue',
    });

    expect(within(resolved).getByText('Resolved')).toBeInTheDocument();
    expect(
      within(resolved).queryByRole('button', { name: 'Dismiss finding' }),
    ).not.toBeInTheDocument();
    expect(
      within(resolved).queryByRole('button', { name: 'Restore finding' }),
    ).not.toBeInTheDocument();
  });

  it('scopes the page and summary card to the event in the URL', () => {
    renderRiskPage(riskWorkspace(), '/risks?event=alpha');

    expect(screen.getByLabelText('Event')).toHaveValue('alpha');
    expect(summaryValue('Open findings')).toBe('2');
    expect(
      screen.getByText('For Alpha Wedding · 2 findings recorded'),
    ).toBeInTheDocument();
  });

  it('requires confirmation, never claims dismissal resolved the issue, and can undo it', async () => {
    const user = userEvent.setup();
    renderRiskPage();

    const card = screen.getByRole('article', {
      name: 'Planned spending exceeds the total budget',
    });

    await user.click(within(card).getByRole('button', { name: 'Dismiss finding' }));

    const confirmation = screen.getByRole('group', {
      name: 'Confirm dismissing Planned spending exceeds the total budget',
    });
    expect(
      within(confirmation).getByRole('button', { name: 'Yes, dismiss' }),
    ).toHaveFocus();

    await user.click(within(confirmation).getByRole('button', { name: 'Keep it open' }));

    expect(screen.queryByRole('group', {
      name: 'Confirm dismissing Planned spending exceeds the total budget',
    })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Dismiss finding' })).toHaveFocus();

    await user.click(within(card).getByRole('button', { name: 'Dismiss finding' }));
    await user.click(screen.getByRole('button', { name: 'Yes, dismiss' }));

    expect(
      screen.getByText(/was dismissed, not resolved/),
    ).toBeInTheDocument();
    expect(summaryValue('Open findings')).toBe('1');
    expect(
      screen.getByRole('heading', { name: 'Open risk review' }),
    ).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Undo dismissal' }));

    expect(screen.getByText(/Dismissal undone/)).toBeInTheDocument();
    expect(summaryValue('Open findings')).toBe('2');
    expect(
      screen.getByRole('article', {
        name: 'Planned spending exceeds the total budget',
      }),
    ).toBeInTheDocument();
  });

  it('keeps dismissed findings in history and restores them explicitly', async () => {
    const user = userEvent.setup();
    renderRiskPage();

    await user.selectOptions(screen.getByLabelText('Event'), 'beta');
    await user.selectOptions(screen.getByLabelText('Status'), 'dismissed');

    const dismissed = screen.getByRole('article', {
      name: 'Dismissed sample issue',
    });

    expect(within(dismissed).getByText('Dismissed')).toBeInTheDocument();
    expect(within(dismissed).queryByRole('button', { name: 'Dismiss finding' })).not.toBeInTheDocument();

    await user.click(within(dismissed).getByRole('button', { name: 'Restore finding' }));

    expect(screen.getByText(/The finding is open again/)).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: 'Dismissed sample issue' }),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'open');

    expect(
      screen.getByRole('article', { name: 'Dismissed sample issue' }),
    ).toBeInTheDocument();
  });

  it('surfaces safe check errors without hiding the rest of the page', () => {
    const invalidDateEvent = makeEvent({
      id: 'broken-date',
      name: 'Broken Date Event',
      startsAt: 'not-a-date',
      venue: 'Hall',
      setting: 'indoor',
      expectedGuests: 0,
    });

    renderRiskPage(makeWorkspace({ events: [invalidDateEvent] }));

    const alert = screen.getByRole('alert');

    expect(alert).toHaveTextContent('Some risk checks could not run');
    expect(alert).toHaveTextContent('Your saved records were not changed.');
    expect(screen.getByRole('option', { name: 'Broken Date Event' })).toBeInTheDocument();
  });
});
