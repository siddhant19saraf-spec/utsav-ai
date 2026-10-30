import {
  AlertTriangle,
  CalendarDays,
  LifeBuoy,
  Plus,
  Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { SelectedEventCard } from '@/components/SelectedEventCard';
import { StatusBadge } from '@/components/StatusBadge';
import { toIsoDate } from '@/lib/date';
import { formatMoney } from '@/lib/money';
import type { CelebrationEvent } from '@/types/domain';
import { calculateBudgetTotals } from '@/features/budget/calculations';
import { useSelectedEvent } from '@/features/events/useSelectedEvent';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { analyzeEventRescue } from './rescueEngine';
import { isApprovableProposal } from './rescueProposalRules';
import {
  createRescueRequestFromForm,
  getInitialRescueForm,
  rescueFieldIds,
  rescueMinimumFieldId,
  type RescueFormErrors,
  type RescueFormValues,
} from './rescueForm';
import { RescueRequestForm } from './RescueRequestForm';
import { RescueResultPanel } from './RescueResultPanel';
import type { RescueResult } from './rescueTypes';

const rescueFieldOrder = [
  'startsAt',
  'expectedGuests',
  'totalBudget',
  'setting',
  'theme',
  'protected',
] as const;

function firstInvalidFieldId(errors: RescueFormErrors): string | null {
  for (const field of rescueFieldOrder) {
    if (errors[field]) {
      return rescueFieldIds[field];
    }
  }

  const minimumKey = Object.keys(errors).find((key) =>
    key.startsWith('minimum:'),
  );

  return minimumKey
    ? rescueMinimumFieldId(minimumKey.slice('minimum:'.length))
    : null;
}

export function EventRescuePage() {
  const { workspace } = useWorkspace();
  const { selectedEvent, handleEventChange } = useSelectedEvent();

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Event Rescue"
        title="Repair the plan, keep the truth visible"
        description="Compare the saved event with a temporary alternative, inspect every finding, and approve a fully validated plan only when you choose to. Budget arithmetic is deterministic integer paise — never AI — and nothing changes until you accept a proposal. Schedule overlaps and RSVP changes are surfaced for review, never applied automatically."
        actions={
          <Link to="/events" className="btn-secondary">
            <CalendarDays className="size-4" aria-hidden="true" />
            My events
          </Link>
        }
      />

      {!selectedEvent ? (
        <EmptyState
          icon={LifeBuoy}
          title="No event to rescue yet"
          description="Event Rescue compares a saved event with a proposed alternative. Create a celebration first, then add budget allocations and tasks so there is something concrete to evaluate."
          action={
            <Link to="/events" className="btn-primary">
              <Plus className="size-4" aria-hidden="true" />
              Create an event
            </Link>
          }
        />
      ) : (
        <>
          <SavedEventCard
            event={selectedEvent}
            events={workspace.events}
            onEventChange={handleEventChange}
          />
          <EventRescueContent key={selectedEvent.id} event={selectedEvent} />
        </>
      )}
    </div>
  );
}

function SavedEventCard({
  event,
  events,
  onEventChange,
}: {
  readonly event: CelebrationEvent;
  readonly events: readonly CelebrationEvent[];
  readonly onEventChange: (eventId: string) => void;
}) {
  const totals = calculateBudgetTotals(event.budget);

  return (
    <SelectedEventCard
      headingId="rescue-event-heading"
      eyebrow="Saved event · original plan"
      event={event}
      events={events}
      selectId="rescue-event"
      selectLabel="Event to analyze"
      selectHint="Switching events never mixes data between celebrations."
      onEventChange={onEventChange}
    >
      <span className="flex items-center gap-1.5">
        <Wallet className="size-3.5 text-gold-600" aria-hidden="true" />
        {formatMoney(event.budget.totalAvailable)} total
      </span>
      <StatusBadge tone={totals.isOverBudget ? 'danger' : 'success'} showDot={false}>
        {totals.isOverBudget
          ? `Over budget by ${formatMoney(totals.overrun)}`
          : 'Within budget'}
      </StatusBadge>
    </SelectedEventCard>
  );
}

function EventRescueContent({ event }: { readonly event: CelebrationEvent }) {
  const {
    workspace,
    applyRescueProposal,
    recordRescueProposal,
    clearRescueProposal,
  } = useWorkspace();
  const todayIso = toIsoDate(new Date());
  const [formValues, setFormValues] = useState<RescueFormValues>(() =>
    getInitialRescueForm(event),
  );
  const [formErrors, setFormErrors] = useState<RescueFormErrors>({});
  const [errorSummary, setErrorSummary] = useState('');
  const [result, setResult] = useState<RescueResult | null>(null);
  const [applyError, setApplyError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusRequestRef = useRef<'form' | 'result' | null>(null);

  useEffect(() => {
    const target = focusRequestRef.current;

    if (!target) {
      return;
    }

    focusRequestRef.current = null;

    if (target === 'form') {
      formHeadingRef.current?.focus();
    } else {
      resultHeadingRef.current?.focus();
    }
  });

  function clearFieldError(field: string) {
    setFormErrors((current) => {
      if (!(field in current)) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function discardProposal() {
    if (result) {
      clearRescueProposal(event.id);
      setAnnouncement(
        'The previous proposal was discarded because the rescue requirements changed. Nothing was saved.',
      );
    }

    setResult(null);
    setApplyError('');
  }

  function updateField<K extends keyof RescueFormValues>(
    field: K,
    value: RescueFormValues[K],
  ) {
    setFormValues((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
    setErrorSummary('');
    discardProposal();
  }

  function updateMinimum(categoryId: string, value: string) {
    setFormValues((current) => ({
      ...current,
      minimums: { ...current.minimums, [categoryId]: value },
    }));
    clearFieldError(`minimum:${categoryId}`);
    setErrorSummary('');
    discardProposal();
  }

  function toggleProtected(categoryId: string, isProtected: boolean) {
    setFormValues((current) => ({
      ...current,
      protectedCategoryIds: isProtected
        ? current.protectedCategoryIds.includes(categoryId)
          ? current.protectedCategoryIds
          : [...current.protectedCategoryIds, categoryId]
        : current.protectedCategoryIds.filter((id) => id !== categoryId),
    }));
    clearFieldError('protected');
    setErrorSummary('');
    discardProposal();
  }

  function resetForm(message: string) {
    clearRescueProposal(event.id);
    setFormValues(getInitialRescueForm(event));
    setFormErrors({});
    setErrorSummary('');
    setResult(null);
    setApplyError('');
    setAnnouncement(message);
    focusRequestRef.current = 'form';
  }

  function handleAnalyze(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    const built = createRescueRequestFromForm(event, formValues, todayIso);

    if (!built.ok) {
      setFormErrors(built.errors);
      setErrorSummary(
        'Some requirements need attention before a rescue analysis can run.',
      );
      setResult(null);
      setApplyError('');
      setAnnouncement(
        'The rescue request has validation errors. Nothing was analyzed or changed.',
      );
      const invalidFieldId = firstInvalidFieldId(built.errors);

      if (invalidFieldId) {
        document.getElementById(invalidFieldId)?.focus();
      }

      return;
    }

    setFormErrors({});
    setErrorSummary('');
    const analysis = analyzeEventRescue({
      event,
      tasks: workspace.tasks,
      activities: workspace.activities,
      guests: workspace.guests,
      cateringEstimate:
        workspace.cateringEstimates.find(
          (estimate) => estimate.eventId === event.id,
        ) ?? null,
      request: built.request,
      todayIso,
    });
    if (analysis.proposal) {
      recordRescueProposal(analysis.proposal);
    } else {
      clearRescueProposal(event.id);
    }

    setResult(analysis);
    setApplyError('');
    focusRequestRef.current = 'result';

    const ready = isApprovableProposal(analysis.proposal, analysis.feasible);
    setAnnouncement(
      ready
        ? `Analysis complete for ${event.name}. A rescue proposal is ready for review. Nothing has been applied.`
        : `Analysis complete for ${event.name}. No approvable proposal was generated. Nothing was applied.`,
    );
  }

  function handleAccept() {
    if (!result?.proposal) {
      return;
    }

    const applied = applyRescueProposal(result.proposal);

    if (applied.ok) {
      setFormValues(getInitialRescueForm(applied.event));
      setFormErrors({});
      setErrorSummary('');
      setResult(null);
      setApplyError('');
      setAnnouncement(applied.message);
      focusRequestRef.current = 'form';
      return;
    }

    setApplyError(applied.message);
    setAnnouncement('');

    if (applied.code === 'persistence') {
      return;
    }

    clearRescueProposal(event.id);
    setResult(null);
    focusRequestRef.current = 'form';
  }

  function handleReject() {
    resetForm(
      'Proposal rejected. The saved event is unchanged and your rescue requirements were reset to the saved values.',
    );
  }

  function handleReturn() {
    clearRescueProposal(event.id);
    setResult(null);
    setApplyError('');
    setAnnouncement('Returned to editing. No changes were applied.');
    focusRequestRef.current = 'form';
  }

  function handleResetRequest() {
    resetForm(
      'Rescue requirements reset to the saved event. Nothing was changed.',
    );
  }

  return (
    <div className="space-y-5">
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <RescueRequestForm
        event={event}
        todayIso={todayIso}
        headingRef={formHeadingRef}
        values={formValues}
        errors={formErrors}
        errorSummary={errorSummary}
        onFieldChange={updateField}
        onMinimumChange={updateMinimum}
        onToggleProtected={toggleProtected}
        onSubmit={handleAnalyze}
        onReset={handleResetRequest}
      />

      {applyError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3.5 text-sm leading-relaxed text-rust-700"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p>{applyError}</p>
            <p className="mt-1 text-xs">
              The saved event was not partially updated.{' '}
              {result
                ? 'The proposal is still shown so you can retry acceptance or reject it.'
                : 'Adjust the requirements and analyze again.'}
            </p>
          </div>
        </div>
      ) : null}

      {result ? (
        <RescueResultPanel
          event={event}
          result={result}
          headingRef={resultHeadingRef}
          onAccept={handleAccept}
          onReject={handleReject}
          onReturn={handleReturn}
        />
      ) : null}
    </div>
  );
}
