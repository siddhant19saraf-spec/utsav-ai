import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import { makeBudget, makeCategory, makeEvent, makeWorkspace } from '@/test/fixtures';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { diagnosticsStore } from '@/features/diagnostics/diagnosticsStore';
import { AiPlanningPage } from './AiPlanningPage';
import type { AiStatus } from './contracts';

vi.mock('./aiFallback', () => ({
  buildLocalFallbackPlan: () => {
    throw new Error('forced fallback failure');
  },
}));

const unconfiguredStatus: AiStatus = {
  configured: false,
  providerName: null,
  model: null,
  message:
    'AI planning is not configured on the API server. Set AI_PROVIDER_API_KEY and AI_MODEL in the server environment. Until then, only the deterministic local outline is available.',
  limits: {
    maxMessageCharacters: 2_000,
    maxRequestBytes: 96_000,
    timeoutMs: 20_000,
    rateLimitPerMinute: 10,
  },
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
          ],
        }),
      }),
    ],
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assistant?event=event-1']}>
      <WorkspaceProvider initialState={makePageWorkspace()}>
        <AiPlanningPage />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

describe('AiPlanningPage recovery', () => {
  it('recovers from an unexpected outline failure instead of leaving the request stuck', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === '/api/ai/status') {
        return jsonResponse(unconfiguredStatus);
      }

      throw new Error(`Unexpected fetch request to ${url}.`);
    });

    renderPage();

    await screen.findByText(unconfiguredStatus.message);
    await user.click(
      screen.getByRole('button', {
        name: 'Suggest a birthday party plan for 30 guests.',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Build deterministic outline' }),
    );

    expect(
      await screen.findByText(/Error code: unexpected-error/),
    ).toBeInTheDocument();
    expect(screen.getByText('The request did not produce a plan')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Building local outline…' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Building a deterministic outline from saved data.'),
    ).not.toBeInTheDocument();

    const outlineButtons = screen.getAllByRole('button', {
      name: 'Build deterministic outline',
    });
    expect(outlineButtons.length).toBeGreaterThan(0);

    for (const button of outlineButtons) {
      expect(button).toBeEnabled();
    }

    const diagnostic = diagnosticsStore
      .getSnapshot()
      .entries.find(
        (entry) =>
          entry.feature === 'AI Planner' && entry.category === 'application',
      );

    expect(diagnostic).toMatchObject({
      category: 'application',
      severity: 'error',
      recovery: 'retry-available',
    });
  });
});
