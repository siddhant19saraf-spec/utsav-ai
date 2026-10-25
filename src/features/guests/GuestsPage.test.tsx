import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Workspace } from '@/types/domain';
import { rupees } from '@/lib/money';
import {
  makeBudget,
  makeCategory,
  makeEvent,
  makeGuest,
  makeWorkspace,
} from '@/test/fixtures';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { GuestsPage } from './GuestsPage';

function renderGuests(initialState: Workspace, initialEntry = '/guests?event=wedding') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WorkspaceProvider initialState={initialState}>
        <GuestsPage />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

function summaryValue(label: string): string | null {
  const labelNode = within(screen.getByRole('region', { name: 'RSVP summary' })).getByText(
    label,
  );
  const card = labelNode.closest('div')?.parentElement;

  return card?.querySelectorAll('p')[1]?.textContent ?? null;
}

function guestItem(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const item = heading.closest('li');

  if (!item) {
    throw new Error(`Could not find the guest list item for ${name}.`);
  }

  return item;
}

function weddingEvent() {
  return makeEvent({
    id: 'wedding',
    name: 'Wedding',
    startsAt: '2030-01-01',
    expectedGuests: 50,
    budget: makeBudget({ eventId: 'wedding' }),
  });
}

function guestAnnouncement(): HTMLElement {
  const status = screen
    .getAllByRole('status')
    .find((element) => element.textContent?.trim());

  if (!status) {
    throw new Error('Expected a guest announcement.');
  }

  return status;
}

describe('GuestsPage guest management', () => {
  it('keeps RSVP counts separate and supports creating, searching, and filtering guests', async () => {
    const user = userEvent.setup();
    renderGuests(
      makeWorkspace({
        events: [weddingEvent()],
        guests: [
          makeGuest({ id: 'ananya', eventId: 'wedding', name: 'Ananya', rsvp: 'confirmed' }),
          makeGuest({ id: 'bob', eventId: 'wedding', name: 'Bob', rsvp: 'pending' }),
          makeGuest({ id: 'cara', eventId: 'wedding', name: 'Cara', rsvp: 'declined' }),
        ],
      }),
    );

    expect(summaryValue('Invited')).toBe('3');
    expect(summaryValue('Confirmed')).toBe('1');
    expect(summaryValue('Pending')).toBe('1');
    expect(summaryValue('Declined')).toBe('1');

    await user.click(screen.getByRole('button', { name: 'Add guest' }));

    const dialog = screen.getByRole('dialog', { name: 'Add a guest' });
    expect(within(dialog).getByLabelText('Guest name')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Guest name'), 'Dev');
    await user.selectOptions(within(dialog).getByLabelText('RSVP status'), 'confirmed');
    await user.type(within(dialog).getByLabelText(/Dietary preference/i), 'Vegan');
    await user.type(
      within(dialog).getByLabelText(/Accessibility request/i),
      'Step-free seating',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add guest' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(guestAnnouncement()).toHaveTextContent(/added dev .* confirmed/i);
    expect(summaryValue('Invited')).toBe('4');
    expect(summaryValue('Confirmed')).toBe('2');
    expect(summaryValue('Pending')).toBe('1');
    expect(summaryValue('Declined')).toBe('1');
    expect(within(guestItem('Dev')).getByText('Confirmed')).toBeInTheDocument();
    expect(within(guestItem('Dev')).getByText('Vegan')).toBeInTheDocument();
    expect(within(guestItem('Dev')).getByText('Step-free seating')).toBeInTheDocument();

    const search = screen.getByLabelText('Search guests by name');
    await user.type(search, 'ana');

    expect(screen.getByRole('heading', { name: 'Ananya' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bob' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cara' })).not.toBeInTheDocument();

    await user.clear(search);

    const rsvpFilters = screen.getByRole('group', {
      name: 'Filter guests by RSVP status',
    });
    await user.click(within(rsvpFilters).getByRole('button', { name: 'Confirmed · 2' }));

    expect(screen.getByRole('heading', { name: 'Ananya' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dev' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bob' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cara' })).not.toBeInTheDocument();
  });

  it('requires a guest name without collecting unnecessary contact details', async () => {
    const user = userEvent.setup();
    renderGuests(makeWorkspace({ events: [weddingEvent()] }));

    await user.click(screen.getByRole('button', { name: 'Add guest' }));

    const dialog = screen.getByRole('dialog', { name: 'Add a guest' });
    expect(within(dialog).queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/phone/i)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Add guest' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /please fix the highlighted fields/i,
    );
    expect(within(dialog).getByText('Enter the guest’s name.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Guest name')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByText('No guests are recorded for this event yet.')).toBeInTheDocument();
  });

  it('edits a guest and deletes only after explicit confirmation', async () => {
    const user = userEvent.setup();
    renderGuests(
      makeWorkspace({
        events: [weddingEvent()],
        guests: [makeGuest({ id: 'dev', eventId: 'wedding', name: 'Dev', rsvp: 'pending' })],
      }),
    );

    await user.click(within(guestItem('Dev')).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog', { name: 'Update this guest' });
    const nameInput = within(dialog).getByLabelText('Guest name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Dev Patel');
    await user.selectOptions(within(dialog).getByLabelText('RSVP status'), 'confirmed');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(guestAnnouncement()).toHaveTextContent(/updated dev patel \(confirmed\)/i);
    expect(screen.getByRole('heading', { name: 'Dev Patel' })).toBeInTheDocument();
    expect(within(guestItem('Dev Patel')).getByText('Confirmed')).toBeInTheDocument();
    expect(summaryValue('Confirmed')).toBe('1');
    expect(summaryValue('Pending')).toBe('0');

    await user.click(within(guestItem('Dev Patel')).getByRole('button', { name: 'Delete' }));

    const confirmation = screen.getByRole('group', {
      name: 'Confirm deletion of Dev Patel',
    });
    expect(screen.getByRole('heading', { name: 'Dev Patel' })).toBeInTheDocument();

    await user.click(within(confirmation).getByRole('button', { name: 'Keep guest' }));
    expect(screen.getByRole('heading', { name: 'Dev Patel' })).toBeInTheDocument();

    await user.click(within(guestItem('Dev Patel')).getByRole('button', { name: 'Delete' }));
    await user.click(
      within(
        screen.getByRole('group', { name: 'Confirm deletion of Dev Patel' }),
      ).getByRole('button', { name: 'Confirm delete' }),
    );

    expect(screen.queryByRole('heading', { name: 'Dev Patel' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No guests for this event yet' })).toBeInTheDocument();
    expect(guestAnnouncement()).toHaveTextContent(/deleted dev patel/i);
    expect(summaryValue('Invited')).toBe('0');
  });

  it('keeps guest records and counts isolated between events', async () => {
    const user = userEvent.setup();
    const wedding = weddingEvent();
    const birthday = makeEvent({
      id: 'birthday',
      name: 'Birthday',
      startsAt: '2030-02-01',
      budget: makeBudget({ eventId: 'birthday' }),
    });
    renderGuests(
      makeWorkspace({
        events: [wedding, birthday],
        guests: [
          makeGuest({ id: 'wedding-guest', eventId: 'wedding', name: 'Wedding Guest', rsvp: 'confirmed' }),
          makeGuest({ id: 'birthday-a', eventId: 'birthday', name: 'Birthday A', rsvp: 'pending' }),
          makeGuest({ id: 'birthday-b', eventId: 'birthday', name: 'Birthday B', rsvp: 'declined' }),
        ],
      }),
    );

    expect(screen.getByRole('heading', { name: 'Wedding Guest' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Birthday A' })).not.toBeInTheDocument();
    expect(summaryValue('Invited')).toBe('1');

    await user.selectOptions(screen.getByLabelText('Event'), 'birthday');

    expect(screen.getByRole('heading', { name: 'Birthday A' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Birthday B' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wedding Guest' })).not.toBeInTheDocument();
    expect(summaryValue('Invited')).toBe('2');
    expect(summaryValue('Pending')).toBe('1');
    expect(summaryValue('Declined')).toBe('1');
    expect(summaryValue('Confirmed')).toBe('0');
  });
});

describe('CateringEstimatorPanel', () => {
  it('uses confirmed RSVPs, rounds the buffer up, and compares the estimate with the budget plan', async () => {
    const user = userEvent.setup();
    const event = makeEvent({
      id: 'wedding',
      name: 'Wedding',
      startsAt: '2030-01-01',
      expectedGuests: 50,
      budget: makeBudget({
        eventId: 'wedding',
        totalAvailable: rupees(20_000),
        categories: [
          makeCategory({
            id: 'catering',
            name: 'Catering',
            planned: rupees(5_000),
          }),
        ],
      }),
    });
    renderGuests(
      makeWorkspace({
        events: [event],
        guests: [
          makeGuest({ id: 'a', eventId: 'wedding', name: 'Ananya', rsvp: 'confirmed' }),
          makeGuest({ id: 'b', eventId: 'wedding', name: 'Bob', rsvp: 'confirmed' }),
          makeGuest({ id: 'c', eventId: 'wedding', name: 'Cara', rsvp: 'pending' }),
        ],
      }),
    );

    const panel = screen.getByRole('region', {
      name: 'Estimate catering from an assumption you control',
    });

    expect(
      within(panel).getByText(/enter a per-person assumption/i),
    ).toBeInTheDocument();

    await user.type(within(panel).getByLabelText(/Per-person cost assumption/i), '500');
    const buffer = within(panel).getByLabelText('Buffer percentage');
    await user.clear(buffer);
    await user.type(buffer, '10');

    const attendeesUsed = within(panel).getByText('Attendees used').closest('div');
    const bufferQuantity = within(panel).getByText('Buffer').closest('div');
    const totalToCater = within(panel).getByText('Total to cater').closest('div');
    const costBox = within(panel).getByText('Estimated catering cost').closest('div');
    const difference = within(panel).getByText('Difference').closest('div');
    const share = within(panel).getByText('Share of total budget').closest('div');

    expect(attendeesUsed).toHaveTextContent('2 guests');
    expect(attendeesUsed).toHaveTextContent('Confirmed RSVPs');
    expect(bufferQuantity).toHaveTextContent('1 guest');
    expect(totalToCater).toHaveTextContent('3 guests');
    expect(costBox).toHaveTextContent('₹1,500');
    expect(costBox).toHaveTextContent('₹500 per guest × 3 estimated attendees');
    expect(costBox).toHaveTextContent('Base ₹1,000 + buffer ₹500');
    expect(costBox).toHaveTextContent(/not a vendor quote/i);
    expect(difference).toHaveTextContent('Below by ₹3,500');
    expect(share).toHaveTextContent('8%');
    expect(panel).toHaveTextContent(/pending and declined guests are excluded/i);

    await user.click(within(panel).getByRole('button', { name: 'Save assumption' }));

    expect(within(panel).getByRole('status')).toHaveTextContent(
      /saved the per-person catering assumption.*10% buffer/i,
    );
  });

  it('falls back to the expected guest count when no guest records exist', async () => {
    const user = userEvent.setup();
    const event = makeEvent({
      id: 'wedding',
      name: 'Wedding',
      startsAt: '2030-01-01',
      expectedGuests: 50,
      budget: makeBudget({ eventId: 'wedding', totalAvailable: rupees(20_000) }),
    });
    renderGuests(makeWorkspace({ events: [event] }));

    const panel = screen.getByRole('region', {
      name: 'Estimate catering from an assumption you control',
    });

    await user.type(within(panel).getByLabelText(/Per-person cost assumption/i), '100');

    const attendeesUsed = within(panel).getByText('Attendees used').closest('div');
    const costBox = within(panel).getByText('Estimated catering cost').closest('div');

    expect(attendeesUsed).toHaveTextContent('50 guests');
    expect(attendeesUsed).toHaveTextContent('Expected guest count');
    expect(costBox).toHaveTextContent('₹5,000');
    expect(panel).toHaveTextContent(
      /no guest records exist for this event, so the saved expected guest count of 50 is used/i,
    );
    expect(panel).toHaveTextContent(/not a vendor quotation/i);
  });

  it('rejects invalid per-person amounts and buffers without saving', async () => {
    const user = userEvent.setup();
    renderGuests(makeWorkspace({ events: [weddingEvent()] }));

    const panel = screen.getByRole('region', {
      name: 'Estimate catering from an assumption you control',
    });

    await user.type(within(panel).getByLabelText(/Per-person cost assumption/i), 'abc');
    const buffer = within(panel).getByLabelText('Buffer percentage');
    await user.clear(buffer);
    await user.type(buffer, '150');
    await user.click(within(panel).getByRole('button', { name: 'Save assumption' }));

    expect(
      within(panel).getByText(/enter a whole rupee amount with up to two decimal places/i),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText('Enter a whole percentage from 0 to 100.'),
    ).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Per-person cost assumption/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    await user.clear(within(panel).getByLabelText(/Per-person cost assumption/i));
    await user.click(within(panel).getByRole('button', { name: 'Save assumption' }));

    expect(
      within(panel).getByText('Enter a per-person catering assumption.'),
    ).toBeInTheDocument();
  });
});
