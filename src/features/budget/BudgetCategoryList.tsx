import { Pencil, Plus, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { formatMoney } from '@/lib/money';
import type { BudgetCategory } from '@/types/budget';
import { calculateCategoryVariance } from './calculations';
import { EMERGENCY_RESERVE_CATEGORY_ID } from './budgetConstants';

interface BudgetCategoryListProps {
  readonly categories: readonly BudgetCategory[];
  readonly onEdit: (category: BudgetCategory) => void;
  readonly onRemove: (categoryId: string) => void;
  readonly onAdd: () => void;
}

function VarianceLabel({ category }: { readonly category: BudgetCategory }) {
  const variance = calculateCategoryVariance(category);

  if (variance.amountMinor === 0) {
    return <span className="text-ink-muted">On plan</span>;
  }

  if (variance.amountMinor > 0) {
    return (
      <span className="text-sage-700">{formatMoney(variance)} still unspent</span>
    );
  }

  return (
    <span className="text-rust-700">
      {formatMoney({ amountMinor: -variance.amountMinor, currency: 'INR' })} over plan
    </span>
  );
}

export function BudgetCategoryList({
  categories,
  onEdit,
  onRemove,
  onAdd,
}: BudgetCategoryListProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const headingId = useId();

  if (categories.length === 0) {
    return (
      <EmptyState
        compact
        title="No expense categories yet"
        description="Add the first category to start planning. An event budget begins empty, so no financial figures are invented for you."
        action={
          <button type="button" onClick={onAdd} className="btn-secondary">
            <Plus className="size-4" aria-hidden="true" />
            Add first category
          </button>
        }
      />
    );
  }

  return (
    <div>
      <p id={headingId} className="sr-only">
        Expense categories
      </p>
      <ul aria-labelledby={headingId} className="space-y-3">
        {categories.map((category) => {
          const isReserve = category.id === EMERGENCY_RESERVE_CATEGORY_ID;
          const isConfirming = confirmingId === category.id;
          const protectionLabel =
            category.flexibility.mode === 'protected' ? 'Protected' : 'Flexible';
          const minimum =
            category.flexibility.mode === 'flexible'
              ? category.flexibility.minimumPlanned
              : null;

          return (
            <li
              key={category.id}
              className="rounded-2xl border border-line bg-surface-muted/70 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{category.name}</h3>
                    <StatusBadge
                      tone={
                        isReserve
                          ? 'warning'
                          : category.flexibility.mode === 'protected'
                            ? 'info'
                            : 'neutral'
                      }
                      showDot={false}
                    >
                      {isReserve ? 'Reserve · protected' : protectionLabel}
                    </StatusBadge>
                  </div>
                  {minimum ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[0.6875rem] text-ink-muted">
                      <SlidersHorizontal className="size-3 shrink-0" aria-hidden="true" />
                      Minimum allocation {formatMoney(minimum)}
                    </p>
                  ) : (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[0.6875rem] text-ink-muted">
                      <ShieldCheck className="size-3 shrink-0" aria-hidden="true" />
                      {isReserve
                        ? 'Ring-fenced for unexpected costs.'
                        : 'Never reduced by repair proposals.'}
                    </p>
                  )}
                  {category.notes ? (
                    <p className="mt-2 max-w-xl text-xs leading-relaxed text-ink-muted">
                      {category.notes}
                    </p>
                  ) : null}
                </div>

                <dl className="grid shrink-0 grid-cols-3 gap-x-4 gap-y-1 text-right text-xs sm:min-w-64">
                  <div>
                    <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                      Planned
                    </dt>
                    <dd className="mt-0.5 font-semibold text-ink tabular-nums">
                      {formatMoney(category.planned)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                      Actual
                    </dt>
                    <dd className="mt-0.5 font-semibold text-ink tabular-nums">
                      {formatMoney(category.actual)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                      Variance
                    </dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      <VarianceLabel category={category} />
                    </dd>
                  </div>
                </dl>
              </div>

              {isReserve ? (
                <p className="mt-3 border-t border-line pt-3 text-[0.6875rem] text-ink-muted">
                  Managed from Emergency reserve settings so repair rules stay consistent.
                </p>
              ) : isConfirming ? (
                <div
                  role="group"
                  aria-label={`Confirm removal of ${category.name}`}
                  className="mt-3 rounded-xl border border-rust-100 bg-rust-50 px-3.5 py-3"
                >
                  <p className="text-xs leading-relaxed text-rust-700">
                    Remove “{category.name}”? Its planned and actual amounts will be deleted
                    from this event budget. This cannot be undone.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingId(null);
                        onRemove(category.id);
                      }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-rust-800 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rust-900"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Remove category
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="btn-ghost text-xs"
                    >
                      Keep category
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => onEdit(category)}
                    className="btn-ghost text-xs"
                    aria-label={`Edit ${category.name}`}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(category.id)}
                    className="btn-ghost text-xs text-rust-700 hover:bg-rust-50 hover:text-rust-700"
                    aria-label={`Remove ${category.name}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
