import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import { makeBudget, makeCategory, makeEvent, makeWorkspace } from '@/test/fixtures';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { BudgetPlannerPage } from './BudgetPlannerPage';

function createWorkspace(): Workspace {
  const wedding = makeEvent({
    id: 'wedding',
    name: 'Wedding',
    startsAt: '2026-12-01',
    expectedGuests: 180,
    budget: makeBudget({
      eventId: 'wedding',
      totalAvailable: rupees(10_000),
      categories: [
        makeCategory({
          id: 'venue',
          name: 'Venue',
          planned: rupees(6_000),
          actual: rupees(1_000),
          flexibility: { mode: 'protected' },
        }),
        makeCategory({
          id: 'decor',
          name: 'Décor',
          planned: rupees(3_000),
          actual: rupees(0),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(2_000) },
        }),
        makeCategory({
          id: 'catering',
          name: 'Catering',
          planned: rupees(2_000),
          actual: rupees(500),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(1_500) },
        }),
      ],
    }),
  });
  const birthday = makeEvent({
    id: 'birthday',
    name: 'Birthday',
    startsAt: '2026-11-20',
    expectedGuests: 30,
    budget: makeBudget({
      eventId: 'birthday',
      totalAvailable: rupees(3_000),
      categories: [
        makeCategory({
          id: 'cake',
          name: 'Cake',
          planned: rupees(500),
          actual: rupees(0),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(0) },
        }),
      ],
    }),
  });

  return makeWorkspace({ events: [wedding, birthday] });
}

function renderPlanner(entry: string, workspace: Workspace = createWorkspace()) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <WorkspaceProvider initialState={workspace}>
        <BudgetPlannerPage />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

function getCategoryRow(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 3, name });
  const row = heading.closest('li');

  if (!row) {
    throw new Error(`Category “${name}” is not rendered in a list item.`);
  }

  return row;
}

describe('BudgetPlannerPage', () => {
  it('switches between isolated event budgets without merging allocations', async () => {
    const user = userEvent.setup();
    renderPlanner('/budget?event=wedding');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Plan every rupee with intent' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Wedding' })).toBeInTheDocument();
    expect(getCategoryRow('Venue')).toHaveTextContent('₹6,000');
    expect(getCategoryRow('Décor')).toHaveTextContent('₹3,000');

    await user.selectOptions(screen.getByLabelText('Event to edit'), 'birthday');

    expect(screen.getByRole('heading', { level: 2, name: 'Birthday' })).toBeInTheDocument();
    expect(getCategoryRow('Cake')).toHaveTextContent('₹500');
    expect(screen.queryByRole('heading', { level: 3, name: 'Venue' })).not.toBeInTheDocument();
    expect(screen.getByText('No repair needed')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Event to edit'), 'wedding');

    expect(getCategoryRow('Venue')).toHaveTextContent('₹6,000');
    expect(getCategoryRow('Décor')).toHaveTextContent('₹3,000');
    expect(screen.queryByRole('heading', { level: 3, name: 'Cake' })).not.toBeInTheDocument();
  });

  it('validates an empty category form and adds the category to the selected event', async () => {
    const user = userEvent.setup();
    renderPlanner('/budget?event=birthday');

    await user.click(screen.getByRole('button', { name: 'Add category' }));

    const form = screen.getByRole('form', { name: 'Add a budget category' });
    const nameInput = within(form).getByLabelText('Category name');

    await user.click(within(form).getByRole('button', { name: 'Add category' }));

    expect(within(form).getByRole('alert')).toHaveTextContent(
      /please fix the highlighted fields/i,
    );
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveFocus();

    await user.type(nameInput, 'Photography');
    await user.type(within(form).getByLabelText('Planned amount (INR)'), '1,000');
    await user.click(within(form).getByRole('button', { name: 'Add category' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      /added “photography” in birthday.*saved in this browser/i,
    );
    expect(getCategoryRow('Photography')).toHaveTextContent('₹1,000');
    expect(screen.getByText(/2 categories recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Add a budget category' })).not.toBeInTheDocument();
  });

  it('edits a category in place without changing its siblings', async () => {
    const user = userEvent.setup();
    renderPlanner('/budget?event=wedding');

    await user.click(screen.getByRole('button', { name: 'Edit Décor' }));

    const form = screen.getByRole('form', { name: 'Edit Décor' });
    const plannedInput = within(form).getByLabelText('Planned amount (INR)');

    await user.clear(plannedInput);
    await user.type(plannedInput, '2,500');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      /updated “décor” in wedding.*saved in this browser/i,
    );
    expect(getCategoryRow('Décor')).toHaveTextContent('₹2,500');
    expect(getCategoryRow('Venue')).toHaveTextContent('₹6,000');
    expect(getCategoryRow('Catering')).toHaveTextContent('₹2,000');
  });

  it('requires confirmation before removing a category', async () => {
    const user = userEvent.setup();
    renderPlanner('/budget?event=birthday');

    await user.click(screen.getByRole('button', { name: 'Remove Cake' }));

    const confirmation = screen.getByRole('group', { name: 'Confirm removal of Cake' });

    expect(
      screen.getByRole('heading', { level: 3, name: 'Cake' }),
    ).toBeInTheDocument();

    await user.click(
      within(confirmation).getByRole('button', { name: 'Remove category' }),
    );

    expect(screen.queryByRole('heading', { level: 3, name: 'Cake' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'No expense categories yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /removed “cake” from birthday.*other allocations were not changed/i,
    );
  });

  it('changes the total budget without touching allocations and flags the overrun', async () => {
    const user = userEvent.setup();
    renderPlanner('/budget?event=birthday');

    const totalInput = screen.getByLabelText('Available budget (INR)');

    expect(totalInput).toHaveValue('3000');

    await user.clear(totalInput);
    await user.type(totalInput, '400');
    await user.click(screen.getByRole('button', { name: 'Save total budget' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      /category allocations were not changed.*₹100 over budget/i,
    );
    expect(getCategoryRow('Cake')).toHaveTextContent('₹500');
    expect(
      screen.getByRole('heading', { name: 'Over budget by ₹100' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/planned expenditure is ₹100 above the total budget/i)).toBeInTheDocument();
  });

  it('reviews a deterministic repair, preserves protected categories, and applies only after approval', async () => {
    const user = userEvent.setup();
    renderPlanner('/budget?event=wedding');

    expect(getCategoryRow('Décor')).toHaveTextContent('₹3,000');

    await user.click(screen.getByRole('button', { name: 'Review repair options' }));

    const panel = screen.getByRole('region', { name: 'A feasible repair is ready' });

    expect(within(panel).getByText('Feasible')).toBeInTheDocument();
    expect(within(panel).getByText('Décor')).toBeInTheDocument();
    expect(within(panel).getByText('−₹1,000')).toBeInTheDocument();
    expect(within(panel).getAllByText('₹10,000')).toHaveLength(2);
    expect(
      within(panel).queryByRole('button', { name: 'Approve and apply' }),
    ).toBeInTheDocument();

    // Nothing changes until approval.
    expect(getCategoryRow('Décor')).toHaveTextContent('₹3,000');
    expect(getCategoryRow('Venue')).toHaveTextContent('₹6,000');

    await user.click(within(panel).getByRole('button', { name: 'Approve and apply' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      /approved repair applied to wedding.*planned expenditure is now ₹10,000.*total budget was not changed/i,
    );
    expect(getCategoryRow('Décor')).toHaveTextContent('₹2,000');
    expect(getCategoryRow('Venue')).toHaveTextContent('₹6,000');
    expect(getCategoryRow('Catering')).toHaveTextContent('₹2,000');
    expect(
      screen.getByRole('progressbar', { name: 'Planned budget utilization' }),
    ).toHaveAttribute('aria-valuetext', '100% of the total budget planned');
    expect(screen.getByText('No repair needed')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Review repair options' }),
    ).not.toBeInTheDocument();
  });

  it('does not offer to apply an infeasible repair and keeps the overrun unchanged', async () => {
    const user = userEvent.setup();
    const workspace = makeWorkspace({
      events: [
        makeEvent({
          id: 'wedding',
          name: 'Wedding',
          budget: makeBudget({
            eventId: 'wedding',
            totalAvailable: rupees(5_000),
            categories: [
              makeCategory({
                id: 'venue',
                name: 'Venue',
                planned: rupees(6_000),
                flexibility: { mode: 'protected' },
              }),
            ],
          }),
        }),
      ],
    });
    renderPlanner('/budget?event=wedding', workspace);

    await user.click(screen.getByRole('button', { name: 'Review repair options' }));

    const panel = screen.getByRole('region', { name: 'No feasible repair exists' });

    expect(within(panel).getByText('Infeasible')).toBeInTheDocument();
    expect(panel).toHaveTextContent(/the plan remains ₹1,000 over budget/i);
    expect(
      within(panel).queryByRole('button', { name: 'Approve and apply' }),
    ).not.toBeInTheDocument();
    expect(getCategoryRow('Venue')).toHaveTextContent('₹6,000');

    await user.click(within(panel).getByRole('button', { name: 'Dismiss proposal' }));

    expect(
      screen.getByRole('heading', { name: 'Over budget by ₹1,000' }),
    ).toBeInTheDocument();
    expect(getCategoryRow('Venue')).toHaveTextContent('₹6,000');
  });

  it('enables and disables the emergency reserve through protected allocation', async () => {
    const user = userEvent.setup();
    renderPlanner('/budget?event=birthday');

    const enableCheckbox = screen.getByRole('checkbox', {
      name: /protect an emergency reserve/i,
    });
    expect(enableCheckbox).not.toBeChecked();

    await user.click(enableCheckbox);

    const targetInput = screen.getByLabelText('Reserve target (INR)');
    expect(targetInput).toBeEnabled();

    await user.clear(targetInput);
    await user.type(targetInput, '300');
    await user.click(screen.getByRole('button', { name: 'Save emergency reserve' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      /emergency reserve for birthday saved at ₹300.*part of the total budget and protected from repair/i,
    );
    expect(getCategoryRow('Emergency reserve')).toHaveTextContent('Reserve · protected');
    expect(getCategoryRow('Emergency reserve')).toHaveTextContent('₹300');
    expect(getCategoryRow('Cake')).toHaveTextContent('₹500');

    const disableCheckbox = screen.getByRole('checkbox', {
      name: /protect an emergency reserve/i,
    });
    expect(disableCheckbox).toBeChecked();

    await user.click(disableCheckbox);
    await user.click(
      screen.getByRole('button', { name: 'Disable emergency reserve' }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      /disabled.*reserve allocation was removed/i,
    );
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Emergency reserve' }),
    ).not.toBeInTheDocument();
    expect(getCategoryRow('Cake')).toHaveTextContent('₹500');
  });
});
