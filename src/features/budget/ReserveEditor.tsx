import { PiggyBank, Save } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatMinorForInput, formatMoney } from '@/lib/money';
import type { EmergencyReserveConfig, EventBudget } from '@/types/budget';
import { calculateEmergencyReserve } from './calculations';
import { parseBudgetAmountInput } from './budgetForm';

interface ReserveEditorProps {
  readonly budget: EventBudget;
  readonly onSave: (reserve: EmergencyReserveConfig) => void;
}

export function ReserveEditor({ budget, onSave }: ReserveEditorProps) {
  const [enabled, setEnabled] = useState(budget.emergencyReserve.enabled);
  const [target, setTarget] = useState(() =>
    formatMinorForInput(budget.emergencyReserve.target.amountMinor),
  );
  const [error, setError] = useState('');
  const enabledId = useId();
  const targetId = useId();
  const errorId = `${targetId}-error`;
  const hintId = `${targetId}-hint`;
  const status = calculateEmergencyReserve(budget);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!enabled) {
      onSave({ enabled: false, target: budget.emergencyReserve.target });
      return;
    }

    const targetMinor = parseBudgetAmountInput(target);

    if (targetMinor === null || targetMinor <= 0) {
      setError('Enter a reserve target from ₹0.01 to ₹100 crore.');
      document.getElementById(targetId)?.focus();
      return;
    }

    setError('');
    onSave({
      enabled: true,
      target: { amountMinor: targetMinor, currency: 'INR' },
    });
  }

  return (
    <section className="surface-card p-5" aria-labelledby={`${enabledId}-heading`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sage-100 bg-sage-50 text-sage-700"
            aria-hidden="true"
          >
            <PiggyBank className="size-5" strokeWidth={1.7} />
          </span>
          <div>
            <h2 id={`${enabledId}-heading`} className="text-lg font-semibold text-ink">
              Emergency reserve
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {status.configured
                ? `${formatMoney(status.allocated)} allocated of ${formatMoney(status.target)} target`
                : 'Not configured'}
            </p>
          </div>
        </div>
        <StatusBadge tone={status.configured ? 'success' : 'neutral'} showDot={false}>
          {status.configured ? 'Enabled' : 'Off'}
        </StatusBadge>
      </div>

      <form noValidate onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label
          htmlFor={enabledId}
          className="flex min-h-11 items-start gap-3 rounded-xl border border-line bg-surface-muted/70 px-3.5 py-3"
        >
          <input
            id={enabledId}
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setEnabled(event.target.checked);
              setError('');
            }}
            className="mt-0.5 size-4 shrink-0 accent-maroon-800"
          />
          <span>
            <span className="block text-sm font-semibold text-ink">
              Protect an emergency reserve
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
              Enabled reserves are protected categories, so repairs cannot reduce them.
            </span>
          </span>
        </label>

        <div>
          <label htmlFor={targetId} className="field-label">
            Reserve target (INR)
          </label>
          <div className="relative mt-1.5">
            <span
              className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-ink-muted"
              aria-hidden="true"
            >
              ₹
            </span>
            <input
              id={targetId}
              name="reserveTarget"
              type="text"
              inputMode="decimal"
              value={target}
              onChange={(event) => {
                setTarget(event.target.value);
                setError('');
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${hintId} ${errorId}` : hintId}
              autoComplete="off"
              disabled={!enabled}
              className={`field-control pl-8 disabled:cursor-not-allowed disabled:opacity-60 ${
                error ? 'border-rust-600' : ''
              }`}
            />
          </div>
          <p id={hintId} className="field-hint mt-1.5">
            The reserve is part of this event&apos;s total budget, not additional money. Saving
            sets its protected allocation to the target.
          </p>
          {error ? (
            <p id={errorId} className="field-error mt-1.5">
              {error}
            </p>
          ) : null}
        </div>

        <button type="submit" className="btn-secondary w-full">
          <Save className="size-4" aria-hidden="true" />
          {enabled ? 'Save emergency reserve' : 'Disable emergency reserve'}
        </button>
      </form>

      {status.configured && status.shortfall.amountMinor > 0 ? (
        <p className="mt-3 text-xs font-medium text-rust-700">
          The reserve is {formatMoney(status.shortfall)} below its target.
        </p>
      ) : null}
      {enabled && !status.isProtected && status.configured ? (
        <p className="mt-3 text-xs font-medium text-rust-700">
          The reserve category is not currently protected. Saving this form restores protection.
        </p>
      ) : null}
    </section>
  );
}
