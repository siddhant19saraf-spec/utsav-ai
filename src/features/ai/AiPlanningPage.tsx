import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { toIsoDate } from '@/lib/date';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { fetchAiStatus, requestAiPlan } from './aiClient';
import {
  createAiContextSignature,
  createAiPlanId,
  buildAiEventContext,
} from './aiContext';
import { buildLocalFallbackPlan } from './aiFallback';
import {
  aiModeDescriptions,
  aiModeExamples,
  aiModeLabels,
  aiModePlaceholders,
} from './aiLabels';
import { AiPlanResult, type AiPlanSelection } from './AiPlanResult';
import {
  validateAiPlan,
  type AiPlanValidation,
} from './planValidation';
import {
  AI_PLAN_MODES,
  type AiPlanEnvelope,
  type AiPlanMode,
  type AiPlanRequest,
  type AiStatus,
} from './contracts';

type StatusState =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly status: AiStatus }
  | { readonly state: 'error'; readonly message: string };

interface GeneratedPlan {
  readonly envelope: AiPlanEnvelope;
  readonly request: AiPlanRequest;
  readonly contextSignature: string;
}

interface RequestFailure {
  readonly code: string;
  readonly message: string;
  readonly requestId: string | null;
}

type PendingKind = 'provider' | 'fallback' | null;

const emptySelection: AiPlanSelection = {
  timelineIndexes: [],
  taskIndexes: [],
};

function statusTone(state: StatusState): 'success' | 'warning' | 'neutral' {
  if (state.state === 'ready') {
    return state.status.configured ? 'success' : 'warning';
  }

  return state.state === 'error' ? 'warning' : 'neutral';
}

export function AiPlanningPage() {
  const {
    workspace,
    applyAiPlan,
    riskAnalysisErrors,
  } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = searchParams.get('event') ?? '';
  const requestedEvent = workspace.events.find(
    (event) => event.id === requestedEventId,
  );
  const [eventId, setEventId] = useState(requestedEvent?.id ?? '');
  const [mode, setMode] = useState<AiPlanMode>('create-plan');
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState('');
  const [statusState, setStatusState] = useState<StatusState>({
    state: 'loading',
  });
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [pending, setPending] = useState<PendingKind>(null);
  const [requestError, setRequestError] = useState<RequestFailure | null>(null);
  const [result, setResult] = useState<GeneratedPlan | null>(null);
  const [selection, setSelection] = useState<AiPlanSelection>(emptySelection);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [applyPending, setApplyPending] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [appliedMessage, setAppliedMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const findings = useMemo(
    () => workspace.riskFindings ?? [],
    [workspace.riskFindings],
  );
  const activeEvent = workspace.events.find((event) => event.id === eventId) ?? null;
  const todayIso = toIsoDate(new Date());
  const openRiskCount = activeEvent
    ? findings.filter(
        (finding) =>
          finding.eventId === activeEvent.id && finding.status === 'open',
      ).length
    : 0;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    void fetchAiStatus({ signal: controller.signal }).then((response) => {
      if (!active) {
        return;
      }

      setStatusState(
        response.ok
          ? { state: 'ready', status: response.data }
          : { state: 'error', message: response.message },
      );
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [statusAttempt]);

  const validation = useMemo<AiPlanValidation | null>(
    () =>
      result
        ? validateAiPlan(result.envelope.plan, result.request, workspace, todayIso)
        : null,
    [result, workspace, todayIso],
  );

  const riskTitles = useMemo(
    () => new Map(findings.map((finding) => [finding.id, finding.title])),
    [findings],
  );

  const currentSignature = useMemo(() => {
    if (!result) {
      return null;
    }

    if (!result.request.event) {
      return 'no-event';
    }

    const event = workspace.events.find(
      (entry) => entry.id === result.request.event?.id,
    );

    if (!event) {
      return null;
    }

    const built = buildAiEventContext(event, workspace, findings);

    return built.ok ? createAiContextSignature(built.context) : null;
  }, [result, workspace, findings]);

  const stale = Boolean(result) && currentSignature !== result?.contextSignature;

  const buildContext = useCallback(
    (
      selectedEvent: typeof activeEvent,
      workspaceSnapshot: typeof workspace,
      findingsSnapshot: typeof findings,
    ):
      | {
          readonly ok: true;
          readonly context: AiPlanRequest['event'];
          readonly signature: string;
        }
      | { readonly ok: false; readonly message: string } => {
      if (!selectedEvent) {
        return { ok: true, context: null, signature: 'no-event' };
      }

      const built = buildAiEventContext(
        selectedEvent,
        workspaceSnapshot,
        findingsSnapshot,
      );

      if (!built.ok) {
        return { ok: false, message: built.message };
      }

      return {
        ok: true,
        context: built.context,
        signature: createAiContextSignature(built.context),
      };
    },
    [],
  );

  const generate = useCallback(
    async (kind: Exclude<PendingKind, null>) => {
      if (pending) {
        return;
      }

      const trimmed = message.trim();

      if (trimmed.length < 3) {
        setMessageError('Write at least 3 characters so the request has a goal.');
        return;
      }

      if (trimmed.length > 2_000) {
        setMessageError('Keep the request to 2,000 characters or fewer.');
        return;
      }

      setMessageError('');

      const contextResult = buildContext(activeEvent, workspace, findings);

      if (!contextResult.ok) {
        setRequestError({
          code: 'invalid-context',
          message: contextResult.message,
          requestId: null,
        });
        setAnnouncement('The request was not sent because the event context could not be read safely.');
        return;
      }

      const request: AiPlanRequest = {
        mode,
        message: trimmed,
        event: contextResult.context,
      };

      setPending(kind);
      setRequestError(null);
      setApplyError('');
      setAppliedMessage('');
      setPreviewOpen(false);
      setResult(null);
      setSelection(emptySelection);
      setAnnouncement(
        kind === 'provider'
          ? 'Generating an AI plan. Nothing will be applied automatically.'
          : 'Building the deterministic local outline. Nothing will be applied automatically.',
      );

      let envelope: AiPlanEnvelope;

      if (kind === 'provider') {
        const response = await requestAiPlan(request);

        if (!response.ok) {
          setRequestError({
            code: response.code,
            message: response.message,
            requestId: response.requestId,
          });
          setAnnouncement(
            'The AI request did not complete. Your saved planning data is unchanged.',
          );
          setPending(null);
          return;
        }

        envelope = response.data;
      } else {
        const fallback = buildLocalFallbackPlan(
          request,
          workspace,
          new Date(),
        );

        if (!fallback.ok) {
          setRequestError({
            code: 'fallback-error',
            message: fallback.message,
            requestId: null,
          });
          setAnnouncement(
            'The local outline could not be built. Your saved planning data is unchanged.',
          );
          setPending(null);
          return;
        }

        envelope = fallback.envelope;
      }

      const nextValidation = validateAiPlan(
        envelope.plan,
        request,
        workspace,
        todayIso,
      );

      setResult({
        envelope,
        request,
        contextSignature: contextResult.signature,
      });
      setSelection({
        timelineIndexes: nextValidation.applyableTimelineIndexes,
        taskIndexes: nextValidation.applyableTaskIndexes,
      });
      setPending(null);
      setAnnouncement(
        envelope.source === 'provider'
          ? `AI plan received from ${envelope.provider.name}. Review the deterministic checks before applying anything.`
          : 'Deterministic local outline built from saved data. It is not an AI response.',
      );
    },
    [
      activeEvent,
      buildContext,
      findings,
      message,
      mode,
      pending,
      todayIso,
      workspace,
    ],
  );

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    void generate('provider');
  }

  function handleEventChange(value: string) {
    setEventId(value);
    setResult(null);
    setSelection(emptySelection);
    setPreviewOpen(false);
    setRequestError(null);
    setApplyError('');
    setAppliedMessage('');
    setMessageError('');
    setSearchParams(value ? { event: value } : {}, { replace: true });
    const event = workspace.events.find((entry) => entry.id === value);
    setAnnouncement(
      event
        ? `AI planning now uses ${event.name}. Generate a new plan for this event.`
        : 'Advisory AI planning selected. No saved event will be changed.',
    );
  }

  function handleModeChange(value: AiPlanMode) {
    setMode(value);
    setMessageError('');
    setAnnouncement(`${aiModeLabels[value]} selected.`);
  }

  function handleToggleTimeline(index: number) {
    setPreviewOpen(false);
    setApplyError('');
    setSelection((current) => ({
      ...current,
      timelineIndexes: current.timelineIndexes.includes(index)
        ? current.timelineIndexes.filter((entry) => entry !== index)
        : [...current.timelineIndexes, index].sort((first, second) => first - second),
    }));
  }

  function handleToggleTask(index: number) {
    setPreviewOpen(false);
    setApplyError('');
    setSelection((current) => ({
      ...current,
      taskIndexes: current.taskIndexes.includes(index)
        ? current.taskIndexes.filter((entry) => entry !== index)
        : [...current.taskIndexes, index].sort((first, second) => first - second),
    }));
  }

  function handleApply() {
    if (!result || !validation || applyPending) {
      return;
    }

    const event = workspace.events.find(
      (entry) => entry.id === result.request.event?.id,
    );

    if (!event) {
      setApplyError(
        'The selected event no longer exists. Nothing was applied. Generate a fresh plan from a saved event.',
      );
      return;
    }

    setApplyPending(true);
    setApplyError('');
    const planId = createAiPlanId(
      event.id,
      result.contextSignature,
      result.envelope.plan,
    );
    const outcome = applyAiPlan({
      planId,
      eventId: event.id,
      requestId: result.envelope.requestId,
      generatedAt: result.envelope.generatedAt,
      source: result.envelope.source,
      contextSignature: result.contextSignature,
      request: result.request,
      plan: result.envelope.plan,
      timelineIndexes: selection.timelineIndexes,
      taskIndexes: selection.taskIndexes,
    });

    setApplyPending(false);

    if (outcome.ok) {
      setAppliedMessage(outcome.message);
      setPreviewOpen(false);
      setAnnouncement(outcome.message);
      return;
    }

    setApplyError(outcome.message);
    setAnnouncement(outcome.message);
  }

  const configured =
    statusState.state === 'ready' && statusState.status.configured;
  const providerBusy = pending !== null;

  return (
    <div className="space-y-7" aria-busy={providerBusy}>
      <PageHeader
        eyebrow="AI Planner"
        title="A planning partner with hard boundaries"
        description="Ask for a structured plan, a revision, or an explanation of saved risks. The app validates every proposal with its deterministic budget, schedule, guest, and risk rules. Nothing is applied without your explicit approval."
        actions={
          <Link to="/settings" className="btn-secondary">
            AI setup and limitations
          </Link>
        }
      />

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <section
        aria-labelledby="ai-status-heading"
        className="surface-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-blue-100 bg-slate-blue-50 text-slate-blue-700"
              aria-hidden="true"
            >
              <ServerCog className="size-5" strokeWidth={1.7} />
            </span>
            <div>
              <h2
                id="ai-status-heading"
                className="text-xl font-semibold tracking-[-0.01em] text-ink"
              >
                Server-side AI status
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                The browser calls the same-origin API at <code>/api</code>. Provider keys
                stay in the API server’s environment and are never bundled into this page.
              </p>
            </div>
          </div>
          <StatusBadge tone={statusTone(statusState)} showDot={false}>
            {statusState.state === 'loading'
              ? 'Checking'
              : statusState.state === 'error'
                ? 'Unavailable'
                : statusState.status.configured
                  ? 'Configured'
                  : 'Not configured'}
          </StatusBadge>
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-surface-muted/55 px-4 py-3.5">
          {statusState.state === 'loading' ? (
            <p className="text-sm text-ink-muted">Checking the AI API server…</p>
          ) : statusState.state === 'error' ? (
            <>
              <p className="flex items-start gap-2 text-sm leading-relaxed text-ink">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-gold-700"
                  aria-hidden="true"
                />
                {statusState.message}
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatusState({ state: 'loading' });
                  setStatusAttempt((attempt) => attempt + 1);
                }}
                className="btn-secondary mt-3 min-h-9 px-3 py-1.5 text-xs"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Check again
              </button>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink">
                {statusState.status.message}
              </p>
              {statusState.status.configured ? (
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-ink-muted">
                  <div>
                    <dt className="inline font-semibold text-ink">Provider: </dt>
                    <dd className="inline">
                      {statusState.status.providerName ?? 'Configured provider'}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-ink">Model: </dt>
                    <dd className="inline">{statusState.status.model ?? 'Configured model'}</dd>
                  </div>
                  {statusState.status.limits ? (
                    <>
                      <div>
                        <dt className="inline font-semibold text-ink">Timeout: </dt>
                        <dd className="inline">
                          {Math.round(statusState.status.limits.timeoutMs / 1_000)}s
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-ink">Rate limit: </dt>
                        <dd className="inline">
                          {statusState.status.limits.rateLimitPerMinute}/minute
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  You can still use the deterministic local outline below. It uses saved
                  data and app rules only, and clearly labels itself as not AI-generated.
                </p>
              )}
            </>
          )}
        </div>

        <p className="mt-3 flex items-start gap-2 text-[0.6875rem] leading-relaxed text-ink-soft">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Only event facts and aggregates are sent. Guest names, emails, notes, dietary
          text, accessibility text, and other events are never included. AI cannot change
          budgets, guest records, protected priorities, or apply its own proposal.
        </p>
      </section>

      {riskAnalysisErrors.length > 0 ? (
        <p
          role="alert"
          className="rounded-2xl border border-gold-200 bg-gold-50/70 px-4 py-3 text-xs leading-relaxed text-ink-muted"
        >
          Some deterministic risk checks could not run, so an AI summary may be
          incomplete. No saved records were changed. Review Risk Intelligence before
          relying on risk statements.
        </p>
      ) : null}

      <section
        aria-labelledby="ai-request-heading"
        className="surface-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-maroon-100 bg-maroon-50 text-maroon-700"
              aria-hidden="true"
            >
              <Sparkles className="size-5" strokeWidth={1.7} />
            </span>
            <div>
              <h2
                id="ai-request-heading"
                className="text-xl font-semibold tracking-[-0.01em] text-ink"
              >
                Describe what you need
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Choose a saved event for event-specific context, or ask for an advisory
                plan without one. The AI never invents vendor prices, bookings, or live
                availability.
              </p>
            </div>
          </div>
          <StatusBadge tone={configured ? 'success' : 'warning'} showDot={false}>
            {configured ? 'AI provider available' : 'Local outline available'}
          </StatusBadge>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ai-event" className="field-label">
                Saved event
              </label>
              <select
                id="ai-event"
                value={activeEvent?.id ?? ''}
                onChange={(changeEvent) => handleEventChange(changeEvent.target.value)}
                className="field-control mt-1.5"
              >
                <option value="">No saved event — advisory plan</option>
                {workspace.events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
              <p className="field-hint mt-1.5">
                {activeEvent
                  ? `${activeEvent.expectedGuests} expected guests · ${openRiskCount} open deterministic ${
                      openRiskCount === 1 ? 'finding' : 'findings'
                    } available for summaries.`
                  : workspace.events.length === 0
                    ? 'Create an event in My Events to apply tasks and timeline suggestions.'
                    : 'Advisory plans can be read but cannot add tasks or activities to an event.'}
              </p>
            </div>

            <div>
              <label htmlFor="ai-mode" className="field-label">
                Request type
              </label>
              <select
                id="ai-mode"
                value={mode}
                onChange={(changeEvent) =>
                  handleModeChange(changeEvent.target.value as AiPlanMode)
                }
                className="field-control mt-1.5"
              >
                {AI_PLAN_MODES.map((entry) => (
                  <option key={entry} value={entry}>
                    {aiModeLabels[entry]}
                  </option>
                ))}
              </select>
              <p className="field-hint mt-1.5">{aiModeDescriptions[mode]}</p>
            </div>
          </div>

          <div>
            <label htmlFor="ai-message" className="field-label">
              Your request
            </label>
            <textarea
              id="ai-message"
              rows={5}
              value={message}
              onChange={(changeEvent) => {
                setMessage(changeEvent.target.value);
                if (messageError) {
                  setMessageError('');
                }
              }}
              maxLength={2_000}
              placeholder={aiModePlaceholders[mode]}
              aria-describedby="ai-message-hint ai-message-count ai-message-error"
              aria-invalid={messageError ? true : undefined}
              className="field-control mt-1.5 min-h-28 resize-y"
            />
            <div className="mt-1.5 flex flex-wrap items-start justify-between gap-2">
              <p id="ai-message-hint" className="field-hint max-w-xl">
                {mode === 'summarize-risks' && activeEvent && openRiskCount === 0
                  ? 'No open deterministic findings are saved for this event, so there is nothing to summarize yet.'
                  : 'Describe the event type, budget, date, venue, guest count, and priorities that matter. The app supplies the saved facts.'}
              </p>
              <p id="ai-message-count" className="text-xs text-ink-soft tabular-nums">
                {message.length} / 2000
              </p>
            </div>
            {messageError ? (
              <p id="ai-message-error" className="field-error mt-1" role="alert">
                {messageError}
              </p>
            ) : null}
          </div>

          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
              Try an example
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {aiModeExamples[mode].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setMessage(example);
                    setMessageError('');
                  }}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-xs leading-relaxed text-ink-muted transition-colors hover:border-gold-400 hover:text-ink"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
            <button
              type="submit"
              disabled={!configured || providerBusy}
              className="btn-primary"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {pending === 'provider' ? 'Generating with AI…' : 'Generate AI plan'}
            </button>
            <button
              type="button"
              onClick={() => void generate('fallback')}
              disabled={providerBusy}
              className="btn-secondary"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {pending === 'fallback'
                ? 'Building local outline…'
                : 'Build deterministic outline'}
            </button>
            {!configured && statusState.state !== 'loading' ? (
              <p className="text-xs leading-relaxed text-ink-muted">
                AI generation needs a configured server provider. The local outline is
                always available.
              </p>
            ) : null}
          </div>
        </form>

        {requestError ? (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3.5"
          >
            <p className="text-sm font-semibold text-rust-700">
              The request did not produce a plan
            </p>
            <p className="mt-1 text-xs leading-relaxed text-rust-700">
              {requestError.message}
            </p>
            <p className="mt-1.5 text-[0.6875rem] text-ink-soft">
              Error code: {requestError.code}
              {requestError.requestId ? ` · Request ${requestError.requestId}` : ''} · Your
              saved planning data was not changed.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {configured ? (
                <button
                  type="button"
                  onClick={() => void generate('provider')}
                  className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  Try again
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void generate('fallback')}
                className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
              >
                Build deterministic outline
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {pending ? (
        <div
          role="status"
          className="surface-card flex items-center gap-3 px-5 py-4 text-sm text-ink-muted"
        >
          <RefreshCw className="size-4 animate-spin text-maroon-700" aria-hidden="true" />
          {pending === 'provider'
            ? 'Generating a structured plan. Deterministic validation runs after the response arrives.'
            : 'Building a deterministic outline from saved data.'}
        </div>
      ) : null}

      {result && validation ? (
        <AiPlanResult
          envelope={result.envelope}
          validation={validation}
          selection={selection}
          onToggleTimeline={handleToggleTimeline}
          onToggleTask={handleToggleTask}
          previewOpen={previewOpen}
          onPreview={() => {
            setPreviewOpen(true);
            setAnnouncement('Preview opened. Review the exact additions before approving.');
          }}
          onCancelPreview={() => setPreviewOpen(false)}
          onApply={handleApply}
          applyPending={applyPending}
          applyError={applyError}
          appliedMessage={appliedMessage}
          stale={stale}
          eventId={result.request.event?.id ?? null}
          eventName={activeEvent?.name ?? null}
          riskTitles={riskTitles}
        />
      ) : null}

      {!result && !pending ? (
        <section
          aria-labelledby="ai-empty-heading"
          className="rounded-3xl border border-dashed border-line-strong bg-surface/60 px-5 py-8 text-center"
        >
          <Sparkles className="mx-auto size-6 text-gold-600" aria-hidden="true" />
          <h2
            id="ai-empty-heading"
            className="mt-2 text-lg font-semibold text-ink"
          >
            No proposal yet
          </h2>
          <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-ink-muted">
            Choose a request type and describe the plan you need. A response will show
            assumptions, gaps, deterministic checks, and a preview before anything can be
            added. You can always use the local outline when no AI provider is configured.
          </p>
        </section>
      ) : null}

      <section
        aria-labelledby="ai-privacy-heading"
        className="rounded-2xl border border-line bg-surface/70 px-4 py-3.5"
      >
        <h2
          id="ai-privacy-heading"
          className="text-xs font-semibold tracking-[0.08em] text-ink-soft uppercase"
        >
          Data and safety boundaries
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
          Sent to the API server when AI is configured: event name, category, date, venue,
          theme, status, expected guest count, aggregate RSVP and requirement counts, budget
          totals and categories, saved catering assumptions, task and activity summaries, and
          open risk summaries. Not sent: guest names, emails, notes, dietary or accessibility
          text, import files, other events, or browser storage. The provider key is
          server-only; this page contains no secret and makes no direct provider request.
        </p>
      </section>
    </div>
  );
}
