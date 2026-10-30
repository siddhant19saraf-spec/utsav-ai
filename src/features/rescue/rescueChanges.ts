import { formatEventDate } from '@/lib/date';
import { formatCount } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { BudgetCategory } from '@/types/budget';
import type { CelebrationEvent } from '@/types/domain';
import {
  rescueFlexibilityLabel,
  rescueSettingLabel,
  rescueThemeLabel,
} from './rescueLabels';
import type { RescueChange } from './rescueTypes';

function answerLabel(value: boolean | null | undefined): string {
  if (value === true) {
    return 'Yes';
  }

  if (value === false) {
    return 'No';
  }

  return 'Not recorded';
}

function plannedImpact(beforeMinor: number, afterMinor: number): string {
  const difference = Math.abs(afterMinor - beforeMinor);
  const direction = afterMinor < beforeMinor ? 'Reduces' : 'Increases';

  return `${direction} this category’s planned spend by ${formatMoney({
    amountMinor: difference,
    currency: 'INR',
  })}. The total budget is unchanged.`;
}

function fixedChange(
  id: string,
  change: Omit<RescueChange, 'id' | 'reversible'>,
): RescueChange {
  return {
    id,
    ...change,
    reversible: true,
  };
}

function findCategory(
  event: CelebrationEvent,
  categoryId: string,
): BudgetCategory | undefined {
  return event.budget.categories.find((category) => category.id === categoryId);
}

/**
 * Builds the human-readable before/after actions shown to the user. Every
 * action can be reversed later through an explicit manual edit; approval does
 * not provide a hidden undo or partial application.
 */
export function buildRescueChanges(
  original: CelebrationEvent,
  proposed: CelebrationEvent,
): RescueChange[] {
  const changes: RescueChange[] = [];

  if (original.budget.totalAvailable.amountMinor !== proposed.budget.totalAvailable.amountMinor) {
    changes.push(
      fixedChange('change-total-budget', {
        kind: 'total-budget',
        label: 'Total budget',
        before: formatMoney(original.budget.totalAvailable),
        after: formatMoney(proposed.budget.totalAvailable),
        impact:
          'Sets the ceiling used to validate every allocation. This amount is only changed because the request asked for it explicitly.',
      }),
    );
  }

  if (original.expectedGuests !== proposed.expectedGuests) {
    changes.push(
      fixedChange('change-guest-count', {
        kind: 'guest-count',
        label: 'Expected guests',
        before: formatCount(original.expectedGuests),
        after: formatCount(proposed.expectedGuests),
        impact:
          'The saved guest count drives the catering baseline when usable catering data exists. It is never changed to force feasibility.',
      }),
    );
  }

  if (original.startsAt !== proposed.startsAt) {
    changes.push(
      fixedChange('change-event-date', {
        kind: 'event-date',
        label: 'Event date',
        before: formatEventDate(original.startsAt),
        after: formatEventDate(proposed.startsAt),
        impact:
          'Task due dates after the new date are reported as scheduling conflicts. The date is not moved automatically by any task.',
      }),
    );
  }

  if ((original.setting ?? null) !== (proposed.setting ?? null)) {
    changes.push(
      fixedChange('change-setting', {
        kind: 'setting',
        label: 'Event setting',
        before: rescueSettingLabel(original.setting),
        after: rescueSettingLabel(proposed.setting),
        impact:
          'Weather-contingency checks use this setting. Recording indoor does not itself create a venue change.',
      }),
    );
  }

  if (rescueThemeLabel(original.theme) !== rescueThemeLabel(proposed.theme)) {
    changes.push(
      fixedChange('change-theme', {
        kind: 'theme',
        label: 'Theme',
        before: rescueThemeLabel(original.theme),
        after: rescueThemeLabel(proposed.theme),
        impact:
          'Theme is planning context only. No financial arithmetic depends on it.',
      }),
    );
  }

  if (
    (original.accessibilityRequired ?? null) !==
      (proposed.accessibilityRequired ?? null) ||
    (original.accessibilityAddressed ?? null) !==
      (proposed.accessibilityAddressed ?? null)
  ) {
    changes.push(
      fixedChange('change-accessibility', {
        kind: 'accessibility',
        label: 'Accessibility readiness',
        before: `Required: ${answerLabel(original.accessibilityRequired)} · Addressed: ${answerLabel(original.accessibilityAddressed)}`,
        after: `Required: ${answerLabel(proposed.accessibilityRequired)} · Addressed: ${answerLabel(proposed.accessibilityAddressed)}`,
        impact:
          'Records the answers used by readiness checks. Event Rescue cannot verify physical access or vendor compliance.',
      }),
    );
  }

  if (
    (original.contingencyPlanConfirmed ?? null) !==
    (proposed.contingencyPlanConfirmed ?? null)
  ) {
    changes.push(
      fixedChange('change-contingency', {
        kind: 'contingency',
        label: 'Outdoor contingency confirmed',
        before: answerLabel(original.contingencyPlanConfirmed),
        after: answerLabel(proposed.contingencyPlanConfirmed),
        impact:
          'Records your confirmation for outdoor or mixed events. It does not book a backup venue or create a commitment.',
      }),
    );
  }

  for (const originalCategory of original.budget.categories) {
    const proposedCategory = findCategory(proposed, originalCategory.id);

    if (
      proposedCategory &&
      proposedCategory.planned.amountMinor !== originalCategory.planned.amountMinor
    ) {
      changes.push(
        fixedChange(`change-planned-${originalCategory.id}`, {
          kind: 'category-planned',
          label: `${originalCategory.name} plan`,
          before: formatMoney(originalCategory.planned),
          after: formatMoney(proposedCategory.planned),
          impact: plannedImpact(
            originalCategory.planned.amountMinor,
            proposedCategory.planned.amountMinor,
          ),
        }),
      );
    }
  }

  for (const originalCategory of original.budget.categories) {
    const proposedCategory = findCategory(proposed, originalCategory.id);

    if (!proposedCategory) {
      continue;
    }

    const protectionChanged =
      originalCategory.flexibility.mode !== proposedCategory.flexibility.mode;

    if (protectionChanged) {
      changes.push(
        fixedChange(`change-protection-${originalCategory.id}`, {
          kind: 'category-protection',
          label: `${originalCategory.name} protection`,
          before: rescueFlexibilityLabel(originalCategory.flexibility),
          after: rescueFlexibilityLabel(proposedCategory.flexibility),
          impact:
            'Future repairs treat this category according to the saved protection. It can be changed again in the Budget Planner.',
        }),
      );
      continue;
    }

    if (
      originalCategory.flexibility.mode === 'flexible' &&
      proposedCategory.flexibility.mode === 'flexible' &&
      originalCategory.flexibility.minimumPlanned.amountMinor !==
        proposedCategory.flexibility.minimumPlanned.amountMinor
    ) {
      changes.push(
        fixedChange(`change-minimum-${originalCategory.id}`, {
          kind: 'category-minimum',
          label: `${originalCategory.name} minimum`,
          before: formatMoney(originalCategory.flexibility.minimumPlanned),
          after: formatMoney(proposedCategory.flexibility.minimumPlanned),
          impact:
            'Repair reductions for this category can go no lower than this minimum. The total budget is unchanged.',
        }),
      );
    }
  }

  return changes;
}
