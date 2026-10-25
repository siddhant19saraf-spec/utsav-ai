import {
  Calculator,
  Info,
  Save,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/StatusBadge';
import {
  formatMinorForInput,
  formatMoney,
  parseRupeesToMinor,
} from '@/lib/money';
import type { CelebrationEvent } from '@/types/domain';
import { calculateCateringEstimate } from '@/features/catering/cateringEstimator';
import { useWorkspace } from '@/features/workspace/workspaceContext';

interface CateringEstimatorPanelProps {
  readonly event: CelebrationEvent;
}

function countLabel(value: number, singular: string, plural = `${singular}s`): string {
  return `${new Intl.NumberFormat('en-IN').format(value)} ${value === 1 ? singular : plural}`;
}

export function CateringEstimatorPanel({ event }: CateringEstimatorPanelProps) {
  const { workspace, saveCateringEstimate } = useWorkspace();
  const savedConfig =
    workspace.cateringEstimates.find((estimate) => estimate.eventId === event.id) ??
    null;
  const [perPersonInput, setPerPersonInput] = useState(() =>
    savedConfig ? formatMinorForInput(savedConfig.perPersonCost.amountMinor) : '',
  );
  const [bufferInput, setBufferInput] = useState(() =>
    savedConfig ? String(savedConfig.bufferPercent) : '0',
  );
  const [perPersonError, setPerPersonError] = useState('');
  const [bufferError, setBufferError] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const perPersonMinor = parseRupeesToMinor(perPersonInput);
  const trimmedBuffer = bufferInput.trim();
  const bufferPercent =
    /^\d{1,3}$/.test(trimmedBuffer) &&
    Number(trimmedBuffer) >= 0 &&
    Number(trimmedBuffer) <= 100
      ? Number(trimmedBuffer)
      : null;
  const canEstimate = perPersonMinor !== null && bufferPercent !== null;

  let estimate: ReturnType<typeof calculateCateringEstimate> | null = null;
  let estimateError = '';

  if (canEstimate) {
    try {
      estimate = calculateCateringEstimate(
        event,
        workspace.guests,
        { amountMinor: perPersonMinor, currency: 'INR' },
        bufferPercent,
      );
    } catch (error) {
      estimateError =
        error instanceof RangeError
          ? error.message
          : 'The catering estimate could not be calculated.';
    }
  }

  const dirty =
    savedConfig === null ||
    formatMinorForInput(savedConfig.perPersonCost.amountMinor) !==
      (perPersonMinor === null ? '' : formatMinorForInput(perPersonMinor)) ||
    savedConfig.bufferPercent !== bufferPercent;

  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    let firstError = false;

    if (!perPersonInput.trim()) {
      setPerPersonError('Enter a per-person catering assumption.');
      firstError = true;
    } else if (perPersonMinor === null) {
      setPerPersonError(
        'Enter a whole rupee amount with up to two decimal places, for example 1,200.',
      );
      firstError = true;
    } else {
      setPerPersonError('');
    }

    if (bufferPercent === null) {
      setBufferError('Enter a whole percentage from 0 to 100.');
      firstError = true;
    } else {
      setBufferError('');
    }

    if (firstError || perPersonMinor === null || bufferPercent === null) {
      return;
    }

    saveCateringEstimate(event.id, { amountMinor: perPersonMinor, currency: 'INR' }, bufferPercent);
    setAnnouncement(
      `Saved the per-person catering assumption of ${formatMoney({
        amountMinor: perPersonMinor,
        currency: 'INR',
      })} with a ${bufferPercent}% buffer for ${event.name}.`,
    );
  }

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="catering-heading">
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-gold-200 bg-gold-50 text-gold-700"
          aria-hidden="true"
        >
          <Calculator className="size-5" strokeWidth={1.8} />
        </span>
        <div>
          <p className="eyebrow">Catering estimator</p>
          <h2
            id="catering-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            Estimate catering from an assumption you control
          </h2>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-ink-muted">
            This is deterministic planning arithmetic. The per-person amount is your own
            assumption — not a vendor quotation, invoice, or current market rate. Confirmed
            RSVPs are used when guest records exist; otherwise the event’s expected guest
            count is used and labelled.
          </p>
        </div>
      </div>

      <form noValidate onSubmit={handleSubmit} className="mt-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_auto] sm:items-start">
          <div>
            <label htmlFor="catering-per-person" className="field-label">
              Per-person cost assumption (INR)
            </label>
            <div className="relative mt-1.5">
              <span
                className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-ink-muted"
                aria-hidden="true"
              >
                ₹
              </span>
              <input
                id="catering-per-person"
                name="perPersonCost"
                type="text"
                inputMode="decimal"
                value={perPersonInput}
                onChange={(changeEvent) => {
                  setPerPersonInput(changeEvent.target.value);
                  setPerPersonError('');
                }}
                aria-invalid={perPersonError ? true : undefined}
                aria-describedby={
                  perPersonError
                    ? 'catering-per-person-hint catering-per-person-error'
                    : 'catering-per-person-hint'
                }
                autoComplete="off"
                placeholder="1,200"
                className={`field-control pl-8 ${perPersonError ? 'border-rust-600' : ''}`}
              />
            </div>
            <p id="catering-per-person-hint" className="field-hint mt-1.5">
              Whole rupees with up to two decimal places. Stored as integer paise.
            </p>
            {perPersonError ? (
              <p id="catering-per-person-error" className="field-error mt-1.5">
                {perPersonError}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="catering-buffer" className="field-label">
              Buffer percentage
            </label>
            <input
              id="catering-buffer"
              name="bufferPercent"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={bufferInput}
              onChange={(changeEvent) => {
                setBufferInput(changeEvent.target.value);
                setBufferError('');
              }}
              aria-invalid={bufferError ? true : undefined}
              aria-describedby={
                bufferError ? 'catering-buffer-error' : 'catering-buffer-hint'
              }
              className={`field-control mt-1.5 ${bufferError ? 'border-rust-600' : ''}`}
            />
            <p id="catering-buffer-hint" className="field-hint mt-1.5">
              Optional headcount cushion, 0–100%. Rounded up.
            </p>
            {bufferError ? (
              <p id="catering-buffer-error" className="field-error mt-1.5">
                {bufferError}
              </p>
            ) : null}
          </div>

          <div className="sm:pt-[1.9rem]">
            <button type="submit" className="btn-primary w-full sm:w-auto">
              <Save className="size-4" aria-hidden="true" />
              Save assumption
            </button>
          </div>
        </div>
      </form>

      {savedConfig && dirty ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold-200 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-700">
          <Info className="size-3.5" aria-hidden="true" />
          Unsaved edits — the estimate below is provisional until you save.
        </p>
      ) : null}

      {estimate ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="rounded-2xl border border-line bg-surface-muted/45 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <UtensilsCrossed className="size-4 text-gold-700" aria-hidden="true" />
              Estimated catering requirement
            </h3>

            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-ink-muted">Attendees used</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                  {countLabel(estimate.baseAttendees, 'guest')}
                </dd>
                <dd className="text-[0.6875rem] text-ink-soft">
                  {estimate.attendeeSource === 'confirmed'
                    ? 'Confirmed RSVPs'
                    : 'Expected guest count'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-muted">Buffer</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                  {countLabel(estimate.bufferAttendees, 'guest')}
                </dd>
                <dd className="text-[0.6875rem] text-ink-soft">
                  {estimate.bufferPercent}% cushion
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-muted">Total to cater</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                  {countLabel(estimate.estimatedAttendees, 'guest')}
                </dd>
                <dd className="text-[0.6875rem] text-ink-soft">Estimate only</dd>
              </div>
            </dl>

            <div className="mt-4 rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3">
              <p className="text-xs font-semibold text-gold-700">
                Estimated catering cost
              </p>
              <p className="mt-0.5 text-2xl font-semibold tracking-[-0.01em] text-ink tabular-nums">
                {formatMoney(estimate.estimatedCost)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {formatMoney(estimate.perPersonCost)} per guest ×{' '}
                {estimate.estimatedAttendees} estimated attendees. Base{' '}
                {formatMoney(estimate.baseCost)} + buffer{' '}
                {formatMoney(estimate.bufferCost)}. Not a vendor quote.
              </p>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              {estimate.attendeeSource === 'confirmed'
                ? `${countLabel(estimate.counts.invited, 'guest record')} available: ${estimate.counts.confirmed} confirmed, ${estimate.counts.pending} pending, ${estimate.counts.declined} declined. Pending and declined guests are excluded from the base attendee count.`
                : `No guest records exist for this event, so the saved expected guest count of ${event.expectedGuests} is used. Add guests to switch to confirmed attendance.`}
            </p>

            {estimate.attendeeSource === 'confirmed' && estimate.counts.confirmed === 0 ? (
              <p className="mt-2 rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-xs leading-relaxed text-gold-700">
                No guests are confirmed yet, so the estimate uses zero confirmed attendees.
                It is not a forecast of final attendance.
              </p>
            ) : null}

            {estimate.dietaryPreferences.length > 0 ? (
              <div className="mt-3">
                <h4 className="text-xs font-semibold text-ink">
                  Dietary preferences among confirmed guests
                </h4>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {estimate.dietaryPreferences.map((preference) => (
                    <li key={preference.label}>
                      <StatusBadge tone="neutral" showDot={false}>
                        {preference.label} · {preference.count}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-soft">
                  Counts come from saved dietary notes; they do not automatically change the
                  per-person cost.
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Wallet className="size-4 text-maroon-700" aria-hidden="true" />
              Budget impact
            </h3>

            {estimate.cateringCategory ? (
              <>
                <dl className="mt-3 space-y-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-muted">Planned catering</dt>
                    <dd className="font-semibold text-ink tabular-nums">
                      {formatMoney(estimate.cateringCategory.planned)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-muted">Planning estimate</dt>
                    <dd className="font-semibold text-ink tabular-nums">
                      {formatMoney(estimate.estimatedCost)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
                    <dt className="text-ink-muted">Difference</dt>
                    <dd
                      className={`font-semibold tabular-nums ${
                        estimate.differenceFromPlanMinor !== null &&
                        estimate.differenceFromPlanMinor > 0
                          ? 'text-rust-700'
                          : 'text-sage-700'
                      }`}
                    >
                      {estimate.differenceFromPlanMinor === null
                        ? '—'
                        : estimate.differenceFromPlanMinor === 0
                          ? 'Matches plan'
                          : `${estimate.differenceFromPlanMinor > 0 ? 'Above' : 'Below'} by ${formatMoney({
                              amountMinor: Math.abs(estimate.differenceFromPlanMinor),
                              currency: 'INR',
                            })}`}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-muted">Share of total budget</dt>
                    <dd className="font-semibold text-ink tabular-nums">
                      {estimate.percentOfTotalBudget}%
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                  “{estimate.cateringCategory.name}” is the matched catering allocation. A
                  difference is a planning signal, not a confirmed overspend.
                </p>
                <Link
                  to={`/budget?event=${event.id}`}
                  className="btn-secondary mt-3 min-h-9 w-full px-3 py-1.5 text-xs"
                >
                  Review the budget
                </Link>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  The budget has no catering category, so there is no planned allocation to
                  compare with this estimate.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                  The estimate is {estimate.percentOfTotalBudget}% of the event’s total
                  budget. Add a real catering category in the Budget Planner if you want a
                  plan comparison.
                </p>
                <Link
                  to={`/budget?event=${event.id}`}
                  className="btn-secondary mt-3 min-h-9 w-full px-3 py-1.5 text-xs"
                >
                  Open the Budget Planner
                </Link>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-line bg-surface-muted/45 px-4 py-4">
          <p className="text-sm leading-relaxed text-ink-muted">
            {estimateError ||
              'Enter a per-person assumption to calculate a planning estimate. No price is assumed for you.'}
          </p>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        Estimates do not reserve food, contact caterers, or change the budget. Confirm
        quantities and prices with real vendors. Guest details stay in this browser and are
        not sent to an AI service.
      </p>
    </section>
  );
}
