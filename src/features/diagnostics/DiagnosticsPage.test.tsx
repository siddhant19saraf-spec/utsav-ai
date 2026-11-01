import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiStatus } from '@/features/ai/contracts';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { makeWorkspace } from '@/test/fixtures';
import { diagnosticsStore } from './diagnosticsStore';
import { DiagnosticsPage } from './DiagnosticsPage';

type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeFetchMock() {
  return vi.fn<(...args: FetchArgs) => Promise<Response>>();
}

function makeAiStatus(overrides: Partial<AiStatus> = {}): AiStatus {
  return {
    configured: false,
    providerName: null,
    model: null,
    message: 'AI planning is not configured.',
    limits: null,
    ...overrides,
  };
}

function stubHealthyFetch(
  aiStatus: AiStatus = makeAiStatus(),
): ReturnType<typeof makeFetchMock> {
  const fetchMock = makeFetchMock();
  fetchMock.mockImplementation((input) =>
    Promise.resolve(
      String(input) === '/api/health'
        ? jsonResponse({ status: 'ok' })
        : jsonResponse(aiStatus),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDiagnostics() {
  return render(
    <MemoryRouter initialEntries={['/diagnostics']}>
      <WorkspaceProvider initialState={makeWorkspace()}>
        <DiagnosticsPage />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

function statusRegion(name: string) {
  return screen.getByRole('region', { name });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DiagnosticsPage', () => {
  it('shows observed application and persistence state with probed service status', async () => {
    const fetchMock = stubHealthyFetch();
    renderDiagnostics();

    expect(within(statusRegion('Application')).getByText('Operational')).toBeInTheDocument();
    expect(
      within(statusRegion('Local persistence')).getByText('Operational'),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(within(statusRegion('API server')).getByText('Operational')).toBeInTheDocument(),
    );
    expect(
      within(statusRegion('AI provider')).getByText('Configuration Required'),
    ).toBeInTheDocument();
    expect(within(statusRegion('AI provider')).queryByText('Operational')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/last checked/i)).toBeInTheDocument();
  });

  it('reports a static deployment as unavailable without claiming AI health', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 404)));
    vi.stubGlobal('fetch', fetchMock);
    renderDiagnostics();

    await waitFor(() =>
      expect(within(statusRegion('API server')).getByText('Unavailable')).toBeInTheDocument(),
    );
    expect(screen.getByText(/static app without the Node API server/i)).toBeInTheDocument();
    expect(
      within(statusRegion('AI provider')).getByText('Unavailable'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flags the application when a render error was recorded', () => {
    stubHealthyFetch();
    diagnosticsStore.report({
      category: 'render',
      severity: 'error',
      feature: 'Application shell',
      message: 'A screen failed to render.',
      recovery: 'retry-available',
    });

    renderDiagnostics();

    expect(
      within(statusRegion('Application')).getByText('Error Detected'),
    ).toBeInTheDocument();
    expect(screen.getByText(/shell error was recorded/i)).toBeInTheDocument();
  });

  it('lists safe diagnostic entries with reference IDs and recovers the log', async () => {
    stubHealthyFetch();
    const entry = diagnosticsStore.report({
      category: 'persistence',
      severity: 'error',
      feature: 'Workspace storage',
      message: 'Changes could not be saved in this browser.',
      recovery: 'retry-available',
      requestId: 'req-123',
    });
    const user = userEvent.setup();

    renderDiagnostics();

    expect(screen.getAllByText(entry.referenceId).length).toBeGreaterThan(0);
    expect(screen.getByText(/workspace storage/i)).toBeInTheDocument();
    expect(
      screen.getByText('Changes could not be saved in this browser.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Retry available')).toBeInTheDocument();
    expect(screen.getByText('req-123')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear log/i }));

    expect(screen.getByText('No application errors recorded')).toBeInTheDocument();
    expect(diagnosticsStore.getSnapshot().entries).toEqual([]);
  });

  it('shows the last successful operation and avoids claiming unverified health', async () => {
    stubHealthyFetch(
      makeAiStatus({
        configured: true,
        providerName: 'Test Provider',
        model: 'test-model',
      }),
    );
    diagnosticsStore.recordOperation('Event Rescue', 'Rescue plan applied');

    renderDiagnostics();

    expect(screen.getByText('Rescue plan applied')).toBeInTheDocument();
    expect(screen.getByText(/event rescue/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(within(statusRegion('AI provider')).getByText('Configured')).toBeInTheDocument(),
    );
    expect(
      within(statusRegion('AI provider')).queryByText('Operational'),
    ).toBeNull();
    expect(screen.getByText(/availability is not verified here/i)).toBeInTheDocument();
    expect(screen.getByText(/no provider request is sent from this page/i)).toBeInTheDocument();
  });

  it('re-checks services and reports the new result', async () => {
    let healthOk = false;
    const fetchMock = makeFetchMock();
    fetchMock.mockImplementation((input) => {
      if (String(input) === '/api/health') {
        return Promise.resolve(
          healthOk ? jsonResponse({ status: 'ok' }) : jsonResponse({}, 404),
        );
      }

      return Promise.resolve(
        jsonResponse(
          makeAiStatus({
            configured: true,
            providerName: 'Test Provider',
            model: 'test-model',
          }),
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderDiagnostics();

    await waitFor(() =>
      expect(within(statusRegion('API server')).getByText('Unavailable')).toBeInTheDocument(),
    );

    healthOk = true;
    await user.click(screen.getByRole('button', { name: /check services/i }));

    await waitFor(() =>
      expect(within(statusRegion('API server')).getByText('Operational')).toBeInTheDocument(),
    );
    expect(within(statusRegion('AI provider')).getByText('Configured')).toBeInTheDocument();
    expect(
      await screen.findByText(/service check complete/i),
    ).toBeInTheDocument();
  });

  it('states the privacy boundary of diagnostics', () => {
    stubHealthyFetch();
    renderDiagnostics();

    expect(
      screen.getByText(/diagnostics never include guest names/i),
    ).toBeInTheDocument();
  });
});
