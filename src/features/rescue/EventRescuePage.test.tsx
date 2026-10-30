import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { addDays, toIsoDate } from '@/lib/date';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import { makeBudget, makeCategory, makeEvent, makeWorkspace } from '@/test/fixtures';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { EventRescuePage } from './EventRescuePage';

function createRescueWorkspace(): Workspace {
  const event = makeEvent({
    id: 'wedding',
    name: 'Wedding',
    startsAt: addDays(toIsoDate(new Date()), 30),
    expectedGuests: 100,
    setting: 'indoor',
    theme: 'Garden',
    accessibilityRequired: true,
    accessibilityAddressed: true,
    contingencyPlanConfirmed: true,
    budget: makeBudget({
      eventId: 'wedding',
      totalAvailable: rupees(10_000),
      categories: [
        makeCategory({
          id: 'venue',
          name: 'Venue',
          planned: rupees(6_000),
          actual: rupees(0),
          flexibility: { mode: 'protected' },
        }),
        makeCategory({
          id: 'catering',
          name: 'Catering',
          planned: rupees(2_000),
          actual: rupees(0),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(1_500) },
        }),
        makeCategory({
          id: 'decor',
          name: 'Décor',
          planned: rupees(3_000),
          actual: rupees(0),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(2_000) },
        }),
      ],
    }),
  });

  return makeWorkspace({ events: [event] });
}

function RescueProbe() {
  const { workspace } = useWorkspace();
  const event = workspace.events.find((entry) => entry.id === 'wedding');
  const decor = event?.budget.categories.find(
    (category) => category.id === 'decor',
  );

  return (
    <div data-testid="rescue-probe">
      <span>{event?.budget.totalAvailable.amountMinor ?? 0}</span>
      <span>{decor?.planned.amountMinor ?? 0}</span>
      <span>{event?.expectedGuests ?? 0}</span>
    </div>
  );
}

function ExternalBudgetChange() {
  const { updateBudgetTotal } = useWorkspace();

  return (
    <button
      type="button"
      onClick={() => updateBudgetTotal('wedding', rupees(12_000))}
    >
      External budget change
    </button>
  );
}

function renderRescue(workspace: Workspace = createRescueWorkspace()) {
  return render(
    <MemoryRouter initialEntries={['/rescue?event=wedding']}>
      <WorkspaceProvider initialState={workspace}>
        <EventRescuePage />
        <RescueProbe />
        <ExternalBudgetChange />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

describe('EventRescuePage', () => {
  it('shows the original and proposed plans, preserves the saved event until approval, then applies the validated plan', async () => {
    const user = userEvent.setup();
    renderRescue();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Repair the plan, keep the truth visible',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Over budget by ₹1,000')).toBeInTheDocument();
    expect(screen.getByTestId('rescue-probe')).toHaveTextContent('1000000300000100');

    await user.click(
      screen.getByRole('button', { name: 'Analyze rescue options' }),
    );

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Rescue analysis for Wedding',
      }),
    ).toHaveFocus();
    expect(
      screen.getByRole('region', { name: 'Detected planning problems' }),
    ).toHaveTextContent(/the plan is over budget/i);

    const proposalPanel = screen.getByRole('region', {
      name: 'Original versus proposed plan',
    });

    expect(within(proposalPanel).getByText('Ready for approval')).toBeInTheDocument();
    expect(
      within(proposalPanel).getByRole('button', { name: 'Accept proposal' }),
    ).toBeEnabled();

    const table = within(proposalPanel).getByRole('table', {
      name: /Category-by-category budget differences/i,
    });
    const decorRow = within(table).getByRole('row', { name: /Décor/ });

    expect(decorRow).toHaveTextContent('₹3,000');
    expect(decorRow).toHaveTextContent('₹2,000');
    expect(decorRow).toHaveTextContent('Reduction of ₹1,000');
    expect(
      within(proposalPanel).getByRole('heading', {
        name: 'Protected priorities (1)',
      }),
    ).toBeInTheDocument();
    expect(
      within(proposalPanel).getByText('Venue', { selector: 'span' }),
    ).toBeInTheDocument();

    // The saved workspace is untouched before approval.
    expect(screen.getByTestId('rescue-probe')).toHaveTextContent('1000000300000100');
    expect(screen.getByText('Over budget by ₹1,000')).toBeInTheDocument();

    await user.click(
      within(proposalPanel).getByRole('button', { name: 'Accept proposal' }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      /changes were applied to “wedding”.*passed the required validation/i,
    );
    expect(screen.getByTestId('rescue-probe')).toHaveTextContent('1000000200000100');
    expect(screen.getByText('Within budget')).toBeInTheDocument();
    expect(screen.queryByText('Over budget by ₹1,000')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Original versus proposed plan' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Describe the change to evaluate' }),
    ).toHaveFocus();
  });

  it('rejects a proposal without applying any part of it', async () => {
    const user = userEvent.setup();
    renderRescue();

    await user.click(
      screen.getByRole('button', { name: 'Analyze rescue options' }),
    );
    await user.click(screen.getByRole('button', { name: 'Reject proposal' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      /proposal rejected.*saved event is unchanged/i,
    );
    expect(screen.getByTestId('rescue-probe')).toHaveTextContent('1000000300000100');
    expect(screen.getByText('Over budget by ₹1,000')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Rescue analysis for Wedding' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Describe the change to evaluate' }),
    ).toHaveFocus();
  });

  it('returns to editing with the request values intact and no saved changes', async () => {
    const user = userEvent.setup();
    renderRescue();

    await user.click(
      screen.getByRole('button', { name: 'Analyze rescue options' }),
    );
    await user.click(screen.getByRole('button', { name: 'Return to editing' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      /returned to editing.*no changes were applied/i,
    );
    expect(screen.getByTestId('rescue-probe')).toHaveTextContent('1000000300000100');
    expect(screen.getByLabelText('Total budget (INR)')).toHaveValue('10000');
    expect(
      screen.getByRole('heading', { name: 'Describe the change to evaluate' }),
    ).toHaveFocus();
  });

  it('validates the request before analysis and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    renderRescue();

    await user.clear(screen.getByLabelText('Event date'));
    await user.clear(screen.getByLabelText('Expected guests'));
    await user.clear(screen.getByLabelText('Total budget (INR)'));
    await user.click(
      screen.getByRole('button', { name: 'Analyze rescue options' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /some requirements need attention/i,
    );
    expect(screen.getByLabelText('Event date')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Event date')).toHaveFocus();
    expect(
      screen.queryByRole('heading', { name: 'Rescue analysis for Wedding' }),
    ).not.toBeInTheDocument();
  });

  it('focuses the invalid minimum repair floor when only that field fails validation', async () => {
    const user = userEvent.setup();
    renderRescue();

    const decorMinimum = screen.getByLabelText('Minimum repair floor for Décor');

    await user.clear(decorMinimum);
    await user.click(
      screen.getByRole('button', { name: 'Analyze rescue options' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/valid minimum/i);
    expect(decorMinimum).toHaveAttribute('aria-invalid', 'true');
    expect(decorMinimum).toHaveAttribute(
      'aria-describedby',
      'rescue-minimum-decor-error',
    );
    expect(decorMinimum).toHaveFocus();
    expect(
      screen.queryByRole('heading', { name: 'Rescue analysis for Wedding' }),
    ).not.toBeInTheDocument();
  });

  it('rejects a stale proposal when the event changes after analysis and never overwrites the newer event', async () => {
    const user = userEvent.setup();
    renderRescue();

    await user.click(
      screen.getByRole('button', { name: 'Analyze rescue options' }),
    );
    expect(
      screen.getByRole('region', { name: 'Original versus proposed plan' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'External budget change' }),
    );
    await user.click(screen.getByRole('button', { name: 'Accept proposal' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      /changed after this proposal was generated/i,
    );
    expect(screen.getByTestId('rescue-probe')).toHaveTextContent('1200000300000100');
    expect(
      screen.queryByRole('region', { name: 'Original versus proposed plan' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Describe the change to evaluate' }),
    ).toHaveFocus();
  });

  it('activates the rescue analysis from the keyboard and moves focus to the result', async () => {
    const user = userEvent.setup();
    renderRescue();

    const analyzeButton = screen.getByRole('button', {
      name: 'Analyze rescue options',
    });
    analyzeButton.focus();
    expect(analyzeButton).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Rescue analysis for Wedding',
      }),
    ).toHaveFocus();
    expect(
      screen.getByRole('region', { name: 'Original versus proposed plan' }),
    ).toBeInTheDocument();
  });
});
