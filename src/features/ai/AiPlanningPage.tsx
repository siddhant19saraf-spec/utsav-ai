import { RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { toIsoDate } from '@/lib/date';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { fetchAiStatus, requestAiPlan } from './aiClient';
import {
  createAiContextSignature,
  createAiPlanId,
  buildAiEventContext,
} from './aiContext';
import { buildLocalFallbackPlan } from './aiFallback';
import { aiModeLabels } from './aiLabels';
import { AiPlanResult, type AiPlanSelection } from './AiPlanResult';
import {
  AiRequestPanel,
  type AiRequestFailure,
  type AiRequestPending,
} from './AiRequestPanel';
import { AiServerStatusPanel, type AiStatusState } from './AiServerStatusPanel';
import {
  validateAiPlan,
  type AiPlanValidation,
} from './planValidation';
import {
  type AiPlanEnvelope,
  type AiPlanMode,
  type AiPlanRequest,
} from './contracts';

interface GeneratedPlan {
  readonly envelope: AiPlanEnvelope;
  readonly request: AiPlanRequest;
  readonly contextSignature: string;
}

const emptySelection: AiPlanSelection = {
  timelineIndexes: [],
  taskIndexes: [],
};

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
  const [statusState, setStatusState] = useState<AiStatusState>({
    state: 'loading',
  });
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [pending, setPending] = useState<AiRequestPending>(null);
  const [requestError, setRequestError] = useState<AiRequestFailure | null>(null);
  const [result, setResult] = useState<GeneratedPlan | null>(null);
  const [selection, setSelection] = useState<AiPlanSelection>(emptySelection);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [applyPending, setApplyPending] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [appliedMessage, setAppliedMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const requestSequenceRef = useRef(0);

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
    async (kind: Exclude<AiRequestPending, null>) => {
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
      const sequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = sequence;

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

        if (requestSequenceRef.current !== sequence) {
          return;
        }

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

  function retryStatus() {
    setStatusState({ state: 'loading' });
    setStatusAttempt((attempt) => attempt + 1);
  }

  function handleMessageChange(value: string) {
    setMessage(value);

    if (messageError) {
      setMessageError('');
    }
  }

  function handleUseExample(value: string) {
    setMessage(value);
    setMessageError('');
  }

  function handleEventChange(value: string) {
    const discardedRequest = pending !== null;

    if (discardedRequest) {
      requestSequenceRef.current += 1;
      setPending(null);
    }

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
    const cancelledNotice = discardedRequest
      ? 'The in-flight request was discarded because the saved event changed. '
      : '';
    setAnnouncement(
      event
        ? `${cancelledNotice}AI planning now uses ${event.name}. Generate a new plan for this event.`
        : `${cancelledNotice}Advisory AI planning selected. No saved event will be changed.`,
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

      <AiServerStatusPanel status={statusState} onRetry={retryStatus} />

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

      <AiRequestPanel
        events={workspace.events}
        activeEvent={activeEvent}
        openRiskCount={openRiskCount}
        mode={mode}
        message={message}
        messageError={messageError}
        configured={configured}
        statusLoading={statusState.state === 'loading'}
        pending={pending}
        requestError={requestError}
        onEventChange={handleEventChange}
        onModeChange={handleModeChange}
        onMessageChange={handleMessageChange}
        onUseExample={handleUseExample}
        onGenerateProvider={() => void generate('provider')}
        onGenerateFallback={() => void generate('fallback')}
      />

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
