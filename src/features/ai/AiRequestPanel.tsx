import { CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import type { FormEvent } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import type { CelebrationEvent } from '@/types/domain';
import {
  aiModeDescriptions,
  aiModeExamples,
  aiModeLabels,
  aiModePlaceholders,
} from './aiLabels';
import { AI_PLAN_MODES, type AiPlanMode } from './contracts';

export type AiRequestPending = 'provider' | 'fallback' | null;

export interface AiRequestFailure {
  readonly code: string;
  readonly message: string;
  readonly requestId: string | null;
}

interface AiRequestPanelProps {
  readonly events: readonly CelebrationEvent[];
  readonly activeEvent: CelebrationEvent | null;
  readonly openRiskCount: number;
  readonly mode: AiPlanMode;
  readonly message: string;
  readonly messageError: string;
  readonly configured: boolean;
  readonly statusLoading: boolean;
  readonly pending: AiRequestPending;
  readonly requestError: AiRequestFailure | null;
  readonly onEventChange: (value: string) => void;
  readonly onModeChange: (value: AiPlanMode) => void;
  readonly onMessageChange: (value: string) => void;
  readonly onUseExample: (value: string) => void;
  readonly onGenerateProvider: () => void;
  readonly onGenerateFallback: () => void;
}

export function AiRequestPanel({
  events,
  activeEvent,
  openRiskCount,
  mode,
  message,
  messageError,
  configured,
  statusLoading,
  pending,
  requestError,
  onEventChange,
  onModeChange,
  onMessageChange,
  onUseExample,
  onGenerateProvider,
  onGenerateFallback,
}: AiRequestPanelProps) {
  const providerBusy = pending !== null;

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    onGenerateProvider();
  }

  return (
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
              onChange={(changeEvent) => onEventChange(changeEvent.target.value)}
              className="field-control mt-1.5"
            >
              <option value="">No saved event — advisory plan</option>
              {events.map((event) => (
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
                : events.length === 0
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
              onChange={(changeEvent) => {
                const nextMode = AI_PLAN_MODES.find(
                  (entry) => entry === changeEvent.target.value,
                );

                if (nextMode) {
                  onModeChange(nextMode);
                }
              }}
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
            onChange={(changeEvent) => onMessageChange(changeEvent.target.value)}
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
                onClick={() => onUseExample(example)}
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
            onClick={onGenerateFallback}
            disabled={providerBusy}
            className="btn-secondary"
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {pending === 'fallback'
              ? 'Building local outline…'
              : 'Build deterministic outline'}
          </button>
          {!configured && !statusLoading ? (
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
                onClick={onGenerateProvider}
                className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Try again
              </button>
            ) : null}
            <button
              type="button"
              onClick={onGenerateFallback}
              className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
            >
              Build deterministic outline
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
