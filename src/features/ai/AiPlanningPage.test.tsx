import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import { makeAiEnvelope } from '@/test/aiFixtures';
import {
  makeBudget,
  makeCategory,
  makeCateringEstimate,
  makeEvent,
  makeGuest,
  makeTask,
  makeWorkspace,
} from '@/test/fixtures';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { AiPlanningPage } from './AiPlanningPage';
import type { AiStatus } from './contracts';

const limits = {
  maxMessageCharacters: 2_000,
  maxRequestBytes: 96_000,
  timeoutMs: 20_000,
  rateLimitPerMinute: 10,
};

const configuredStatus: AiStatus = {
  configured: true,
  providerName: 'Test Provider',
  model: 'test-model',
  message:
    'The server-side AI provider is configured. Requests are validated before any suggestion is shown, and nothing is applied without your approval.',
  limits,
};

const unconfiguredStatus: AiStatus = {
  configured: false,
  providerName: null,
  model: null,
  message:
    'AI planning is not configured on the API server. Set AI_PROVIDER_API_KEY and AI_MODEL in the server environment. Until then, only the deterministic local outline is available.',
  limits,
};

function makePageWorkspace(): Workspace {
  return makeWorkspace({
    events: [
      makeEvent({
        id: 'event-1',
        name: 'Test Celebration',
        startsAt: '2030-12-01',
        venue: 'Test Venue',
        expectedGuests: 100,
        budget: makeBudget({
          eventId: 'event-1',
          totalAvailable: rupees(100_000),
          categories: [
            makeCategory({
              id: 'cat-venue',
              name: 'Venue',
              planned: rupees(40_000),
              flexibility: { mode: 'protected' },
            }),
            makeCategory({
              id: 'cat-catering',
              name: 'Catering',
              planned: rupees(20_000),
              flexibility: {
                mode: 'flexible',
                minimumPlanned: rupees(15_000),
              },
            }),
          ],
        }),
      }),
    ],
    tasks: [
      makeTask({
        id: 'existing-task',
        eventId: 'event-1',
        title: 'Existing saved task',
        dueDate: '2030-11-01',
        status: 'open',
      }),
    ],
    guests: [
      makeGuest({
        id: 'guest-private',
        eventId: 'event-1',
        name: 'Aarav Secret',
        rsvp: 'confirmed',
        dietaryPreference: 'Jain meal',
        notes: 'private note',
      }),
    ],
    cateringEstimates: [
      makeCateringEstimate({
        eventId: 'event-1',
        perPersonCost: rupees(500),
        bufferPercent: 10,
      }),
    ],
  });
}

function WorkspaceProbe() {
  const { workspace, toggleTask } = useWorkspace();

  return (
    <div>
      <p data-testid="task-count">{workspace.tasks.length}</p>
      <p data-testid="activity-count">{workspace.activities.length}</p>
      <ul data-testid="saved-task-titles">
        {workspace.tasks.map((task) => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
      <ul data-testid="saved-activity-titles">
        {workspace.activities.map((activity) => (
          <li key={activity.id}>{activity.title}</li>
        ))}
      </ul>
      <button type="button" onClick={() => toggleTask('existing-task')}>
        Complete saved task
      </button>
    </div>
  );
}

function renderPage(workspace: Workspace) {
  return render(
    <MemoryRouter initialEntries={['/assistant?event=event-1']}>
      <WorkspaceProvider initialState={workspace}>
        <AiPlanningPage />
        <WorkspaceProbe />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch(options: {
  status: () => Response | Promise<Response>;
  plan?: (init: RequestInit | undefined) => Response | Promise<Response>;
}) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input: Parameters<typeof fetch>[0], init) => {
      const url = requestUrl(input);

      if (url === '/api/ai/status') {
        return options.status();
      }

      if (url === '/api/ai/plan' && options.plan) {
        return options.plan(init);
      }

      throw new Error(`Unexpected fetch request to ${url}.`);
    });
}

async function fillRequest(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', {
      name: 'Suggest a birthday party plan for 30 guests.',
    }),
  );
}

describe('AiPlanningPage', () => {
  it('keeps deterministic planning available without a provider and applies only after approval', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      status: () => jsonResponse(unconfiguredStatus),
    });
    renderPage(makePageWorkspace());

    await screen.findByText(unconfiguredStatus.message);
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Generate AI plan/i }),
    ).toBeDisabled();

    await fillRequest(user);
    await user.click(
      screen.getByRole('button', { name: 'Build deterministic outline' }),
    );

    expect(
      await screen.findByText('Local deterministic outline'),
    ).toBeInTheDocument();
    expect(screen.getByText('Not AI-generated')).toBeInTheDocument();
    expect(screen.getByText(/AI planning is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/Suggested allocation/)).not.toBeInTheDocument();
    expect(screen.getByTestId('task-count')).toHaveTextContent('1');
    expect(screen.getByTestId('activity-count')).toHaveTextContent('0');
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => requestUrl(input) === '/api/ai/plan',
      ),
    ).toHaveLength(0);

    await user.click(
      screen.getByRole('button', { name: 'Preview selected changes' }),
    );
    expect(
      screen.getByRole('region', { name: 'Exact changes to add' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Approve and add to event' }),
    );

    expect(await screen.findByText('Additions approved')).toBeInTheDocument();
    expect(
      Number(screen.getByTestId('task-count').textContent),
    ).toBeGreaterThan(1);
    expect(screen.getByTestId('saved-task-titles')).toHaveTextContent(
      'Existing saved task',
    );
    expect(screen.getByTestId('saved-task-titles')).toHaveTextContent(
      'Confirm venue and vendor contracts',
    );
    expect(screen.getByTestId('activity-count')).toHaveTextContent('0');
  });

  it('previews a provider proposal without sending private guest details and applies only after approval', async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch({
      status: () => jsonResponse(configuredStatus),
      plan: () => jsonResponse(makeAiEnvelope()),
    });
    renderPage(makePageWorkspace());

    await screen.findByText(configuredStatus.message);
    await fillRequest(user);
    await user.click(
      screen.getByRole('button', { name: 'Generate AI plan' }),
    );

    expect(await screen.findByText('AI suggestion')).toBeInTheDocument();
    expect(screen.getByText('Generated by AI')).toBeInTheDocument();
    expect(screen.getByText('Confirm final seating plan')).toBeInTheDocument();
    expect(screen.getByText('Guest welcome')).toBeInTheDocument();

    expect(screen.getByTestId('task-count')).toHaveTextContent('1');
    expect(screen.getByTestId('activity-count')).toHaveTextContent('0');

    const planCall = fetchMock.mock.calls.find(
      ([input]) => requestUrl(input) === '/api/ai/plan',
    );

    expect(planCall).toBeDefined();
    const sentBody = String(planCall?.[1]?.body);
    const sent = JSON.parse(sentBody) as {
      event?: { name?: string; guestCounts?: unknown };
    };

    expect(sent.event?.name).toBe('Test Celebration');
    expect(sent.event?.guestCounts).toEqual({
      invited: 1,
      confirmed: 1,
      pending: 0,
      declined: 0,
    });
    expect(sentBody).not.toContain('Aarav Secret');
    expect(sentBody).not.toContain('Jain meal');
    expect(sentBody).not.toContain('private note');

    await user.click(
      screen.getByRole('button', { name: 'Preview selected changes' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Approve and add to event' }),
    );

    expect(await screen.findByText('Additions approved')).toBeInTheDocument();
    expect(screen.getByTestId('task-count')).toHaveTextContent('2');
    expect(screen.getByTestId('activity-count')).toHaveTextContent('1');
    expect(screen.getByTestId('saved-task-titles')).toHaveTextContent(
      'Confirm final seating plan',
    );
    expect(screen.getByTestId('saved-activity-titles')).toHaveTextContent(
      'Guest welcome',
    );
  });

  it('shows a provider failure without changing saved planning data', async () => {
    const user = userEvent.setup();
    installFetch({
      status: () => jsonResponse(configuredStatus),
      plan: () =>
        jsonResponse(
          {
            error: {
              code: 'invalid-provider-response',
              message:
                'The AI provider returned a response that could not be validated. Nothing was shown or applied. Try again or use the deterministic local outline.',
              requestId: 'req-fail-1',
              retryAfterSeconds: null,
            },
          },
          502,
        ),
    });
    renderPage(makePageWorkspace());

    await screen.findByText(configuredStatus.message);
    await fillRequest(user);
    await user.click(
      screen.getByRole('button', { name: 'Generate AI plan' }),
    );

    expect(
      await screen.findByText('The request did not produce a plan'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing was shown or applied/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Error code: invalid-provider-response/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('task-count')).toHaveTextContent('1');
    expect(screen.getByTestId('activity-count')).toHaveTextContent('0');
    expect(screen.queryByText('AI suggestion')).not.toBeInTheDocument();
  });

  it('reports a status API failure while keeping the local outline usable', async () => {
    const user = userEvent.setup();
    installFetch({
      status: () => {
        throw new TypeError('fetch failed');
      },
    });
    renderPage(makePageWorkspace());

    expect(await screen.findByText('Check again')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/could not be reached/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Generate AI plan/i }),
    ).toBeDisabled();

    await fillRequest(user);
    await user.click(
      screen.getByRole('button', { name: 'Build deterministic outline' }),
    );

    expect(
      await screen.findByText('Local deterministic outline'),
    ).toBeInTheDocument();
    expect(screen.getByText('Not AI-generated')).toBeInTheDocument();
  });

  it('disables applying when the saved event changes after a proposal is generated', async () => {
    const user = userEvent.setup();
    installFetch({
      status: () => jsonResponse(configuredStatus),
      plan: () => jsonResponse(makeAiEnvelope()),
    });
    renderPage(makePageWorkspace());

    await screen.findByText(configuredStatus.message);
    await fillRequest(user);
    await user.click(
      screen.getByRole('button', { name: 'Generate AI plan' }),
    );
    await screen.findByText('AI suggestion');

    await user.click(
      screen.getByRole('button', { name: 'Complete saved task' }),
    );

    expect(
      await screen.findByText(/changed after this plan was generated/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Preview selected changes' }),
    ).toBeDisabled();
    expect(screen.getByTestId('task-count')).toHaveTextContent('1');
    expect(
      screen.queryByText('Additions approved'),
    ).not.toBeInTheDocument();
  });
});
