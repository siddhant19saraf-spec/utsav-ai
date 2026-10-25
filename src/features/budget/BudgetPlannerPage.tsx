import {
  CalendarDays,
  CloudOff,
  Info,
  Plus,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatEventDate } from '@/lib/date';
import { planningStatusMap } from '@/lib/eventMeta';
import { createId } from '@/lib/id';
import { formatMoney } from '@/lib/money';
import type { BudgetCategory, EmergencyReserveConfig } from '@/types/budget';
import type { CelebrationEvent, Money } from '@/types/domain';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { BudgetCategoryForm } from './BudgetCategoryForm';
import { BudgetCategoryList } from './BudgetCategoryList';
import { BudgetRepairPanel } from './BudgetRepairPanel';
import { BudgetSummary } from './BudgetSummary';
import { BudgetTotalEditor } from './BudgetTotalEditor';
import { calculateBudgetTotals } from './calculations';
import { createCategoryFromForm, type BudgetCategoryFormInput } from './budgetForm';
import { proposeBudgetRepair } from './repair';
import { ReserveEditor } from './ReserveEditor';
import { validateBudget } from './validation';

function createUniqueCategoryId(categories: readonly BudgetCategory[]): string {
  const ids = new Set(categories.map((category) => category.id));
  let id = createId('budget-category');

  while (ids.has(id)) {
    id = createId('budget-category');
  }

  return id;
}

function BudgetPlannerPageShell() {
  const { workspace, persistence } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = searchParams.get('event');
  const selectedEvent =
    workspace.events.find((event) => event.id === requestedEventId) ??
    workspace.events[0] ??
    null;

  function handleEventChange(eventId: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('event', eventId);
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Budget Planner"
        title="Plan every rupee with intent"
        description="Build one protected, deterministic budget per event. Adjust allocations, track actual spend, and review repair options before anything changes. All totals use integer paise in code, never AI arithmetic."
        actions={
          <Link to="/events" className="btn-secondary">
            <CalendarDays className="size-4" aria-hidden="true" />
            My events
          </Link>
        }
      />

      {persistence.status !== 'local' ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3.5 text-sm text-ink-muted"
        >
          <CloudOff className="mt-0.5 size-4 shrink-0 text-gold-700" aria-hidden="true" />
          <p className="leading-relaxed">{persistence.message}</p>
        </div>
      ) : null}

      {!selectedEvent ? (
        <EmptyState
          icon={Wallet}
          title="No event budgets yet"
          description="An event budget is created with every event. Create a celebration first, then return here to add expense categories and plan its budget."
          action={
            <Link to="/events" className="btn-primary">
              <Plus className="size-4" aria-hidden="true" />
              Create an event
            </Link>
          }
        />
      ) : (
        <>
          <section
            aria-labelledby="budget-event-heading"
            className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6"
          >
            <div className="min-w-0">
              <p className="eyebrow">Event budget</p>
              <h2
                id="budget-event-heading"
                className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
              >
                {selectedEvent.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-gold-600" aria-hidden="true" />
                  <time dateTime={selectedEvent.startsAt}>
                    {formatEventDate(selectedEvent.startsAt)}
                  </time>
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-gold-600" aria-hidden="true" />
                  {new Intl.NumberFormat('en-IN').format(selectedEvent.expectedGuests)} expected
                  guests
                </span>
                <StatusBadge
                  tone={planningStatusMap[selectedEvent.status].tone}
                  showDot={false}
                >
                  {planningStatusMap[selectedEvent.status].label}
                </StatusBadge>
              </div>
            </div>

            <div className="w-full sm:w-72">
              <label htmlFor="budget-event" className="field-label">
                Event to edit
              </label>
              <select
                id="budget-event"
                value={selectedEvent.id}
                onChange={(event) => handleEventChange(event.target.value)}
                className="field-control mt-1.5"
              >
                {workspace.events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
              <p className="field-hint mt-1.5">
                Each event has an isolated budget. Switching events never merges allocations.
              </p>
            </div>
          </section>

          <BudgetPlannerContent key={selectedEvent.id} event={selectedEvent} />
        </>
      )}
    </div>
  );
}

function BudgetPlannerContent({ event }: { readonly event: CelebrationEvent }) {
  const {
    saveBudgetCategory,
    removeBudgetCategory,
    applyBudgetRepair,
    updateBudgetTotal,
    updateEmergencyReserve,
  } = useWorkspace();
  const [editing, setEditing] = useState<BudgetCategory | 'new' | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const budget = event.budget;
  const totals = calculateBudgetTotals(budget);
  const validation = validateBudget(budget);
  const proposal =
    repairOpen && totals.isOverBudget
      ? proposeBudgetRepair({
          totalBudget: budget.totalAvailable,
          categories: budget.categories,
        })
      : null;

  function handleSaveCategory(input: BudgetCategoryFormInput) {
    const isEditing = editing !== null && editing !== 'new';
    const category = isEditing
      ? createCategoryFromForm(input, editing.id)
      : createCategoryFromForm(input, createUniqueCategoryId(budget.categories));

    saveBudgetCategory(event.id, category);
    setEditing(null);
    setAnnouncement(
      `${isEditing ? 'Updated' : 'Added'} “${category.name}” in ${event.name}. The change is saved in this browser.`,
    );
  }

  function handleRemoveCategory(categoryId: string) {
    const category = budget.categories.find((entry) => entry.id === categoryId);
    removeBudgetCategory(event.id, categoryId);

    if (editing !== null && editing !== 'new' && editing.id === categoryId) {
      setEditing(null);
    }

    if (category) {
      setAnnouncement(
        `Removed “${category.name}” from ${event.name}. Other allocations were not changed.`,
      );
    }
  }

  function handleUpdateTotal(totalAvailable: Money) {
    const overrun = totals.planned.amountMinor - totalAvailable.amountMinor;
    updateBudgetTotal(event.id, totalAvailable);
    setRepairOpen(false);
    setAnnouncement(
      `Total budget for ${event.name} updated to ${formatMoney(totalAvailable)}. Category allocations were not changed.${
        overrun > 0
          ? ` Planned allocations are now ${formatMoney({
              amountMinor: overrun,
              currency: 'INR',
            })} over budget.`
          : ''
      }`,
    );
  }

  function handleSaveReserve(reserve: EmergencyReserveConfig) {
    updateEmergencyReserve(event.id, reserve);
    setAnnouncement(
      reserve.enabled
        ? `Emergency reserve for ${event.name} saved at ${formatMoney(reserve.target)}. It is part of the total budget and protected from repair.`
        : `Emergency reserve for ${event.name} disabled. Its reserve allocation was removed.`,
    );
  }

  function handleApplyRepair() {
    if (!proposal?.feasible) {
      return;
    }

    applyBudgetRepair(event.id, proposal.categories);
    setRepairOpen(false);
    setAnnouncement(
      `Approved repair applied to ${event.name}. Planned expenditure is now ${formatMoney(
        proposal.revisedTotal,
      )}; the total budget was not changed.`,
    );
  }

  return (
    <div className="space-y-5">
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <BudgetSummary budget={budget} totals={totals} validation={validation} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="surface-card p-5 sm:p-6" aria-labelledby="categories-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Breakdown</p>
              <h2 id="categories-heading" className="mt-1 text-xl font-semibold text-ink">
                Expense categories
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {budget.categories.length} categor
                {budget.categories.length === 1 ? 'y' : 'ies'} recorded, including the emergency
                reserve when enabled
              </p>
            </div>
            {editing === null ? (
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="btn-primary shrink-0 self-start"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add category
              </button>
            ) : null}
          </div>

          {editing !== null ? (
            <div className="mt-4">
              <BudgetCategoryForm
                key={editing === 'new' ? 'new-category' : editing.id}
                {...(editing === 'new' ? {} : { category: editing })}
                onSubmit={handleSaveCategory}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : null}

          <div className="mt-5">
            <BudgetCategoryList
              categories={budget.categories}
              onEdit={(category) => setEditing(category)}
              onRemove={handleRemoveCategory}
              onAdd={() => setEditing('new')}
            />
          </div>
        </section>

        <div className="space-y-5">
          <BudgetTotalEditor
            totalAvailable={budget.totalAvailable}
            onSave={handleUpdateTotal}
          />

          <ReserveEditor
            key={`reserve-${budget.updatedAt}`}
            budget={budget}
            onSave={handleSaveReserve}
          />

          {totals.isOverBudget && !proposal ? (
            <section
              className="surface-card p-5 border-rust-100 bg-rust-50/40"
              aria-labelledby="repair-trigger-heading"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-rust-100 bg-rust-50 text-rust-700"
                  aria-hidden="true"
                >
                  <ShieldAlert className="size-5" strokeWidth={1.8} />
                </span>
                <div>
                  <h2
                    id="repair-trigger-heading"
                    className="text-lg font-semibold text-ink"
                  >
                    Over budget by {formatMoney(totals.overrun)}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    Generate a deterministic repair proposal. Protected categories and flexible
                    minimums are hard constraints, and nothing changes until you approve it.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRepairOpen(true)}
                className="btn-primary mt-4 w-full"
              >
                Review repair options
              </button>
            </section>
          ) : null}

          {proposal ? (
            <BudgetRepairPanel
              proposal={proposal}
              onApply={handleApplyRepair}
              onDismiss={() => setRepairOpen(false)}
            />
          ) : null}

          {!totals.isOverBudget && !proposal ? (
            <section className="surface-card p-5" aria-labelledby="within-budget-heading">
              <div className="flex items-start gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sage-100 bg-sage-50 text-sage-700"
                  aria-hidden="true"
                >
                  <Info className="size-5" strokeWidth={1.8} />
                </span>
                <div>
                  <h2
                    id="within-budget-heading"
                    className="text-lg font-semibold text-ink"
                  >
                    No repair needed
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    Planned expenditure fits the total budget. Repair proposals appear only when
                    allocations exceed the budget, and they always require your approval.
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function BudgetPlannerPage() {
  return <BudgetPlannerPageShell />;
}
