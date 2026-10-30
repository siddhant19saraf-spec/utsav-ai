import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeEvent } from '@/test/fixtures';
import { SelectedEventCard } from './SelectedEventCard';

function renderCard(onEventChange = vi.fn()) {
  const wedding = makeEvent({ id: 'wedding', name: 'Wedding', expectedGuests: 240 });
  const birthday = makeEvent({ id: 'birthday', name: 'Birthday' });

  render(
    <SelectedEventCard
      headingId="page-event-heading"
      eyebrow="Selected event"
      event={wedding}
      events={[wedding, birthday]}
      selectId="page-event"
      selectLabel="Event to view"
      selectHint="Records stay isolated per event."
      onEventChange={onEventChange}
    >
      <span>Extra meta</span>
    </SelectedEventCard>,
  );

  return { onEventChange };
}

describe('SelectedEventCard', () => {
  it('renders the page heading, event meta, and extra children', () => {
    renderCard();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Wedding' }),
    ).toHaveAttribute('id', 'page-event-heading');
    expect(screen.getByText('Extra meta')).toBeInTheDocument();
    expect(screen.getByText(/240 expected guests/)).toBeInTheDocument();
  });

  it('wires a labelled event picker to the change handler', async () => {
    const user = userEvent.setup();
    const { onEventChange } = renderCard();

    const select = screen.getByLabelText('Event to view');
    expect(select).toHaveValue('wedding');
    expect(select).toHaveAccessibleDescription('Records stay isolated per event.');
    expect(
      screen.getByRole('option', { name: 'Birthday' }),
    ).toBeInTheDocument();

    await user.selectOptions(select, 'birthday');

    expect(onEventChange).toHaveBeenCalledWith('birthday');
  });
});
