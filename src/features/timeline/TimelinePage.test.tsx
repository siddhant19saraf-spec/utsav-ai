import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Workspace } from '@/types/domain';
import { makeActivity, makeBudget, makeEvent, makeTask, makeWorkspace } from '@/test/fixtures';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { TimelinePage } from './TimelinePage';

function renderTimeline(initialState: Workspace, initialEntry = '/timeline') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WorkspaceProvider initialState={initialState}>
        <TimelinePage />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

function activityItem(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title });
  const item = heading.closest('li');

  if (!item) {
    throw new Error(`Could not find the list item for ${title}.`);
  }

  return item;
}

function taskItem(title: string): HTMLElement {
  const checkbox = screen.getByRole('checkbox', { name: title });
  const item = checkbox.closest('li');

  if (!item) {
    throw new Error(`Could not find the task list item for ${title}.`);
  }

  return item;
}

function activitySection(): HTMLElement {
  const section = screen.getByRole('heading', { name: 'Activities' }).closest('section');

  if (!section) {
    throw new Error('Could not find the activities section.');
  }

  return section;
}

function taskSection(): HTMLElement {
  const section = screen
    .getByRole('heading', { name: 'Preparation tasks' })
    .closest('section');

  if (!section) {
    throw new Error('Could not find the task section.');
  }

  return section;
}

describe('TimelinePage activities', () => {
  it('adds an activity, surfaces an overlap for review, and keeps both saved times unchanged', async () => {
    const user = userEvent.setup();
    const wedding = makeEvent({
      id: 'wedding',
      name: 'Wedding',
      startsAt: '2030-01-01',
      budget: makeBudget({ eventId: 'wedding' }),
    });
    renderTimeline(
      makeWorkspace({
        events: [wedding],
        activities: [
          makeActivity({
            id: 'ceremony',
            eventId: 'wedding',
            title: 'Ceremony',
            startsAt: '2030-01-01T10:00',
            endsAt: '2030-01-01T12:00',
          }),
        ],
      }),
      '/timeline?event=wedding',
    );

    await user.click(screen.getByRole('button', { name: 'Add activity' }));

    const dialog = screen.getByRole('dialog', {
      name: 'Add an activity to the timeline',
    });

    await user.type(within(dialog).getByLabelText('Activity title'), 'Photos');
    fireEvent.change(within(dialog).getByLabelText('Starts'), {
      target: { value: '2030-01-01T11:00' },
    });
    fireEvent.change(within(dialog).getByLabelText('Ends'), {
      target: { value: '2030-01-01T13:00' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Add activity' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(activitySection()).getByRole('status')).toHaveTextContent(
      /added .*photos/i,
    );
    expect(
      screen.getByRole('heading', { name: '1 overlapping activity needs review' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/overlaps can be intentional/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Overlap review')).toHaveLength(2);

    const ceremonyTimes = within(activityItem('Ceremony'))
      .getAllByRole('time')
      .map((time) => time.getAttribute('datetime'));
    const photoTimes = within(activityItem('Photos'))
      .getAllByRole('time')
      .map((time) => time.getAttribute('datetime'));

    expect(ceremonyTimes).toEqual(['2030-01-01T10:00', '2030-01-01T12:00']);
    expect(photoTimes).toEqual(['2030-01-01T11:00', '2030-01-01T13:00']);
  });

  it('rejects an end time that is not after the start time', async () => {
    const user = userEvent.setup();
    const wedding = makeEvent({
      id: 'wedding',
      startsAt: '2030-01-01',
      budget: makeBudget({ eventId: 'wedding' }),
    });
    renderTimeline(
      makeWorkspace({ events: [wedding] }),
      '/timeline?event=wedding',
    );

    await user.click(screen.getByRole('button', { name: 'Add activity' }));

    const dialog = screen.getByRole('dialog', {
      name: 'Add an activity to the timeline',
    });

    await user.type(within(dialog).getByLabelText('Activity title'), 'Broken slot');
    fireEvent.change(within(dialog).getByLabelText('Starts'), {
      target: { value: '2030-01-01T10:00' },
    });
    fireEvent.change(within(dialog).getByLabelText('Ends'), {
      target: { value: '2030-01-01T10:00' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Add activity' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /please fix the highlighted fields/i,
    );
    expect(within(dialog).getByText('The end time must be after the start time.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Ends')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.queryByRole('heading', { name: 'Broken slot' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('edits, completes, reopens, and deletes an activity with explicit confirmation', async () => {
    const user = userEvent.setup();
    const wedding = makeEvent({
      id: 'wedding',
      startsAt: '2030-01-01',
      budget: makeBudget({ eventId: 'wedding' }),
    });
    renderTimeline(
      makeWorkspace({
        events: [wedding],
        activities: [
          makeActivity({
            id: 'dinner',
            eventId: 'wedding',
            title: 'Welcome dinner',
            startsAt: '2030-01-01T19:00',
            endsAt: '2030-01-01T21:00',
          }),
        ],
      }),
      '/timeline?event=wedding',
    );

    await user.click(within(activityItem('Welcome dinner')).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog', { name: 'Update this activity' });
    const titleInput = within(dialog).getByLabelText('Activity title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Welcome dinner and toasts');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(within(activitySection()).getByRole('status')).toHaveTextContent(
      /updated .*welcome dinner and toasts/i,
    );
    expect(screen.getByRole('heading', { name: 'Welcome dinner and toasts' })).toBeInTheDocument();

    await user.click(
      within(activityItem('Welcome dinner and toasts')).getByRole('button', {
        name: 'Mark complete',
      }),
    );

    expect(within(activityItem('Welcome dinner and toasts')).getByText('Completed')).toBeInTheDocument();
    expect(within(activitySection()).getByRole('status')).toHaveTextContent(
      /completed .*welcome dinner and toasts/i,
    );

    await user.click(
      within(activityItem('Welcome dinner and toasts')).getByRole('button', {
        name: 'Reopen',
      }),
    );

    expect(within(activityItem('Welcome dinner and toasts')).queryByText('Completed')).not.toBeInTheDocument();

    await user.click(
      within(activityItem('Welcome dinner and toasts')).getByRole('button', {
        name: 'Delete',
      }),
    );

    const confirmation = screen.getByRole('group', {
      name: 'Confirm deletion of Welcome dinner and toasts',
    });
    expect(screen.getByRole('heading', { name: 'Welcome dinner and toasts' })).toBeInTheDocument();

    await user.click(within(confirmation).getByRole('button', { name: 'Confirm delete' }));

    expect(
      screen.queryByRole('heading', { name: 'Welcome dinner and toasts' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No activities yet' })).toBeInTheDocument();
    expect(within(activitySection()).getByRole('status')).toHaveTextContent(
      /deleted .*welcome dinner and toasts/i,
    );
  });
});

describe('TimelinePage tasks and event isolation', () => {
  it('calculates overdue tasks and completion progress from stored state', async () => {
    const user = userEvent.setup();
    const wedding = makeEvent({
      id: 'wedding',
      name: 'Wedding',
      startsAt: '2030-01-01',
      budget: makeBudget({ eventId: 'wedding' }),
    });
    renderTimeline(
      makeWorkspace({
        events: [wedding],
        tasks: [
          makeTask({
            id: 'overdue',
            eventId: 'wedding',
            title: 'Send invitations',
            dueDate: '2020-01-01',
            status: 'open',
          }),
          makeTask({
            id: 'done',
            eventId: 'wedding',
            title: 'Book the venue',
            dueDate: '2029-12-01',
            status: 'completed',
          }),
        ],
      }),
      '/timeline?event=wedding',
    );

    expect(screen.getByText('1 of 2 tasks')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Task completion for Wedding' }),
    ).toHaveAttribute('aria-valuetext', '1 of 2 tasks complete, 50%');
    expect(screen.getByText('Open tasks past the due date')).toBeInTheDocument();
    expect(within(taskItem('Send invitations')).getByText('Overdue')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', { name: 'Send invitations' });
    await user.click(checkbox);

    expect(screen.getByText('2 of 2 tasks')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Task completion for Wedding' }),
    ).toHaveAttribute('aria-valuetext', '2 of 2 tasks complete, 100%');
    expect(within(taskSection()).getByRole('status')).toHaveTextContent(
      /completed .*send invitations/i,
    );
    expect(screen.getByText('Nothing past due')).toBeInTheDocument();
    expect(within(taskItem('Send invitations')).queryByText('Overdue')).not.toBeInTheDocument();

    const statusFilters = screen.getByRole('group', { name: 'Filter tasks by status' });
    await user.click(within(statusFilters).getByRole('button', { name: 'Open' }));

    expect(screen.getByText('No tasks match these filters')).toBeInTheDocument();
  });

  it('keeps activities and tasks isolated when switching events', async () => {
    const user = userEvent.setup();
    const wedding = makeEvent({
      id: 'wedding',
      name: 'Wedding',
      startsAt: '2030-01-01',
      budget: makeBudget({ eventId: 'wedding' }),
    });
    const birthday = makeEvent({
      id: 'birthday',
      name: 'Birthday',
      startsAt: '2030-02-01',
      budget: makeBudget({ eventId: 'birthday' }),
    });
    renderTimeline(
      makeWorkspace({
        events: [wedding, birthday],
        activities: [
          makeActivity({ id: 'wedding-activity', eventId: 'wedding', title: 'Wedding ceremony' }),
          makeActivity({ id: 'birthday-activity', eventId: 'birthday', title: 'Birthday cake' }),
        ],
        tasks: [
          makeTask({ id: 'wedding-task', eventId: 'wedding', title: 'Wedding task' }),
          makeTask({ id: 'birthday-task', eventId: 'birthday', title: 'Birthday task' }),
        ],
      }),
      '/timeline?event=wedding',
    );

    expect(screen.getByRole('heading', { name: 'Wedding ceremony' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Wedding task' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Birthday cake' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Birthday task' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Event'), 'birthday');

    expect(screen.getByRole('heading', { name: 'Birthday cake' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Birthday task' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wedding ceremony' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Wedding task' })).not.toBeInTheDocument();
  });
});
