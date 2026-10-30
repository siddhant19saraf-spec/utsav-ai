import { Save, Wallet } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { FieldError } from '@/components/FieldError';
import { formatMinorForInput, formatMoney } from '@/lib/money';
import type { Money } from '@/types/domain';
import { parseBudgetAmountInput } from './budgetForm';

interface BudgetTotalEditorProps {
  readonly totalAvailable: Money;
  readonly onSave: (totalAvailable: Money) => void;
}

export function BudgetTotalEditor({ totalAvailable, onSave }: BudgetTotalEditorProps) {
  const [value, setValue] = useState(() => formatMinorForInput(totalAvailable.amountMinor));
  const [error, setError] = useState('');
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseBudgetAmountInput(value);

    if (amountMinor === null) {
      setError('Enter a total from ₹0 to ₹100 crore, with up to two decimal places.');
      document.getElementById(inputId)?.focus();
      return;
    }

    setError('');
    onSave({ amountMinor, currency: 'INR' });
  }

  return (
    <section className="surface-card p-5" aria-labelledby={`${inputId}-heading`}>
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-gold-200 bg-gold-50 text-gold-700"
          aria-hidden="true"
        >
          <Wallet className="size-5" strokeWidth={1.7} />
        </span>
        <div>
          <h2 id={`${inputId}-heading`} className="text-lg font-semibold text-ink">
            Total budget
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Currently {formatMoney(totalAvailable)} for this event
          </p>
        </div>
      </div>

      <form noValidate onSubmit={handleSubmit} className="mt-4">
        <label htmlFor={inputId} className="field-label">
          Available budget (INR)
        </label>
        <div className="relative mt-1.5">
          <span
            className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-ink-muted"
            aria-hidden="true"
          >
            ₹
          </span>
          <input
            id={inputId}
            name="totalBudget"
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError('');
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            autoComplete="off"
            className={`field-control pl-8 ${error ? 'border-rust-600' : ''}`}
          />
        </div>
        <p id={hintId} className="field-hint mt-1.5">
          Changing the total never changes category allocations. Validation will flag any
          resulting overrun.
        </p>
        {error ? (
          <FieldError id={errorId}>{error}</FieldError>
        ) : null}
        <button type="submit" className="btn-secondary mt-3 w-full">
          <Save className="size-4" aria-hidden="true" />
          Save total budget
        </button>
      </form>
    </section>
  );
}
