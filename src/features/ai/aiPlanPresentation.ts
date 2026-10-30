import { formatMoney } from '@/lib/money';
import type { AiPlanIssue, AiValidationArea } from './planValidation';

export interface AiPlanSelection {
  readonly timelineIndexes: readonly number[];
  readonly taskIndexes: readonly number[];
}

export const areaLabels: Record<AiValidationArea, string> = {
  timeline: 'Timeline',
  tasks: 'Tasks',
  budget: 'Budget',
  catering: 'Catering',
  risks: 'Risks',
  plan: 'Plan',
};

export const severityMeta = {
  error: { label: 'Blocker', tone: 'danger' as const },
  warning: { label: 'Review', tone: 'warning' as const },
  info: { label: 'Note', tone: 'info' as const },
};

export const budgetPriorityLabels = {
  essential: 'Essential',
  important: 'Important',
  optional: 'Optional',
} as const;

export function itemIsBlocked(issues: readonly AiPlanIssue[]): boolean {
  return issues.some(
    (issue) =>
      issue.severity === 'error' ||
      issue.code === 'timeline-duplicate' ||
      issue.code === 'task-duplicate',
  );
}

/** Formats an advisory suggestion amount, which the AI contracts always define in INR. */
export function formatAdvisoryMoney(amountMinor: number | null): string {
  return amountMinor === null
    ? 'Not available'
    : formatMoney({ amountMinor, currency: 'INR' });
}
