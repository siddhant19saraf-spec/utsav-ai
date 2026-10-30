import { createRef } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { rupees } from '@/lib/money';
import { makeBudget, makeCategory, makeEvent } from '@/test/fixtures';
import {
  getInitialRescueForm,
  type RescueFormErrors,
  type RescueFormValues,
} from './rescueForm';
import { RescueRequestForm } from './RescueRequestForm';

function createEvent() {
  return makeEvent({
    id: 'wedding',
    name: 'Wedding',
    budget: makeBudget({
      eventId: 'wedding',
      totalAvailable: rupees(10_000),
      categories: [
        makeCategory({
          id: 'venue',
          name: 'Venue',
          planned: rupees(6_000),
          flexibility: { mode: 'protected' },
        }),
        makeCategory({
          id: 'catering',
          name: 'Catering',
          planned: rupees(2_000),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(1_500) },
        }),
        makeCategory({
          id: 'decor',
          name: 'Décor',
          planned: rupees(3_000),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(2_000) },
        }),
      ],
    }),
  });
}

function renderForm({
  values = getInitialRescueForm(createEvent()),
  errors = {},
  errorSummary = '',
}: {
  values?: RescueFormValues;
  errors?: RescueFormErrors;
  errorSummary?: string;
} = {}) {
  const handlers = {
    onFieldChange: vi.fn(),
    onMinimumChange: vi.fn(),
    onToggleProtected: vi.fn(),
    onSubmit: vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    ),
    onReset: vi.fn(),
  };

  render(
    <RescueRequestForm
      event={createEvent()}
      todayIso="2026-10-24"
      headingRef={createRef<HTMLHeadingElement>()}
      values={values}
      errors={errors}
      errorSummary={errorSummary}
      onFieldChange={handlers.onFieldChange}
      onMinimumChange={handlers.onMinimumChange}
      onToggleProtected={handlers.onToggleProtected}
      onSubmit={handlers.onSubmit}
      onReset={handlers.onReset}
    />,
  );

  return handlers;
}

describe('RescueRequestForm', () => {
  it('renders the saved requirements and never offers a minimum floor for a saved protection', () => {
    renderForm();

    expect(screen.getByLabelText('Event date')).toHaveValue('2026-12-01');
    expect(screen.getByLabelText('Expected guests')).toBeInTheDocument();
    expect(screen.getByLabelText('Total budget (INR)')).toHaveValue('10000');
    expect(
      screen.getByLabelText('Minimum repair floor for Catering'),
    ).toHaveValue('1500');
    expect(
      screen.queryByLabelText('Minimum repair floor for Venue'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Venue' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Protected in the saved budget. This analysis will never reduce it.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Catering' }),
    ).not.toBeChecked();
  });

  it('treats an analysis-only protection as read-only and hides its minimum floor', () => {
    const event = createEvent();

    renderForm({
      values: {
        ...getInitialRescueForm(event),
        protectedCategoryIds: ['decor'],
      },
    });

    expect(
      screen.queryByLabelText('Minimum repair floor for Décor'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Protected for this analysis only. Its minimum is not used.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Décor' }),
    ).toBeChecked();
  });

  it('links field errors, reports edits, and forwards reset and submit', async () => {
    const user = userEvent.setup();
    const handlers = renderForm({
      errors: {
        startsAt: 'Choose a valid event date.',
        'minimum:catering': 'Enter a valid minimum with up to two decimal places.',
      },
      errorSummary:
        'Some requirements need attention before a rescue analysis can run.',
    });

    const alert = screen.getByRole('alert');

    expect(alert).toHaveTextContent(/some requirements need attention/i);
    expect(within(alert).getByText('Choose a valid event date.')).toBeInTheDocument();

    const dateInput = screen.getByLabelText('Event date');

    expect(dateInput).toHaveAttribute('aria-invalid', 'true');
    expect(dateInput).toHaveAttribute('aria-describedby', 'rescue-date-error');
    expect(screen.getByLabelText('Minimum repair floor for Catering')).toHaveAttribute(
      'aria-describedby',
      'rescue-minimum-catering-error',
    );

    fireEvent.change(screen.getByLabelText('Theme (optional)'), {
      target: { value: 'Garden Gala' },
    });
    fireEvent.change(screen.getByLabelText('Minimum repair floor for Catering'), {
      target: { value: '1800' },
    });
    await user.click(screen.getByRole('checkbox', { name: 'Catering' }));
    await user.click(screen.getByRole('button', { name: 'Reset to saved values' }));
    await user.click(
      screen.getByRole('button', { name: 'Analyze rescue options' }),
    );

    expect(handlers.onFieldChange).toHaveBeenCalledWith('theme', 'Garden Gala');
    expect(handlers.onMinimumChange).toHaveBeenCalledWith('catering', '1800');
    expect(handlers.onToggleProtected).toHaveBeenCalledWith('catering', true);
    expect(handlers.onReset).toHaveBeenCalledTimes(1);
    expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
  });
});
