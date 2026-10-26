import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { App } from './App';

const navigationLabels = [
  'Overview',
  'My Events',
  'Budget Planner',
  'Event Rescue',
  'Timeline',
  'Guests',
  'Risk Intelligence',
  'AI Planner',
  'Settings',
];

const lazyPageTimeout = { timeout: 5_000 } as const;

function findDashboardHeading() {
  return screen.findByRole(
    'heading',
    { level: 1, name: 'Welcome to UTSAV AI' },
    lazyPageTimeout,
  );
}

function renderApp(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('renders the dashboard shell with all nine navigation destinations', async () => {
    renderApp();

    expect(await findDashboardHeading()).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getAllByText(/plan smarter\. celebrate better\./i).length).toBeGreaterThan(0);

    for (const label of navigationLabels) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    const summaryRegion = screen.getByRole('region', { name: 'Workspace summary' });

    for (const summaryLabel of [
      'Total events',
      'Upcoming events',
      'Planned budget',
      'Pending tasks',
    ]) {
      expect(within(summaryRegion).getByText(summaryLabel)).toBeInTheDocument();
    }

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Ananya & Rohan’s Wedding' },
        lazyPageTimeout,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Sample').length).toBeGreaterThan(0);
  }, 15_000);

  it('navigates to routed pages and keeps the active item marked', async () => {
    const user = userEvent.setup();
    renderApp();
    await findDashboardHeading();

    await user.click(screen.getByRole('link', { name: 'My Events' }));

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Every celebration, in one place' },
        lazyPageTimeout,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Events' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(screen.getByRole('link', { name: 'Budget Planner' }));

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Plan every rupee with intent' },
        lazyPageTimeout,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Expense categories' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Event to edit')).toHaveValue('sample-ananya-rohan-wedding');
    expect(screen.getByRole('link', { name: 'Budget Planner' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }, 15_000);

  it('opens the mobile navigation, moves focus into it, and closes on selection', async () => {
    const user = userEvent.setup();
    renderApp();
    await findDashboardHeading();

    expect(screen.queryByRole('navigation', { name: 'Mobile primary' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));

    const mobileNavigation = screen.getByRole('navigation', { name: 'Mobile primary' });
    expect(
      screen.getByRole('button', { name: 'Close navigation menu' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(within(mobileNavigation).getByRole('link', { name: 'Overview' })).toHaveFocus();

    await user.click(within(mobileNavigation).getByRole('link', { name: 'Timeline' }));

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Keep the schedule in view' },
        lazyPageTimeout,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Mobile primary' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  }, 15_000);

  it('closes the mobile navigation with Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    renderApp();
    await findDashboardHeading();

    const openButton = screen.getByRole('button', { name: 'Open navigation menu' });
    await user.click(openButton);
    expect(screen.getByRole('navigation', { name: 'Mobile primary' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    const restoredButton = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(restoredButton).toHaveAttribute('aria-expanded', 'false');
    expect(restoredButton).toHaveFocus();
    expect(screen.queryByRole('navigation', { name: 'Mobile primary' })).not.toBeInTheDocument();
  }, 15_000);
});
