import type { BudgetTotals } from '@/features/budget/calculations';
import type {
  CateringEstimateConfig,
  CelebrationEvent,
  EventSetting,
  Guest,
  Money,
  PlanningTask,
  TimelineActivity,
} from '@/types/domain';

export type RescueSeverity = 'critical' | 'warning' | 'info';

export type RescueCertainty = 'confirmed' | 'potential' | 'missing-data' | 'assumption';

export type RescueArea =
  | 'budget'
  | 'guests'
  | 'catering'
  | 'tasks'
  | 'schedule'
  | 'weather'
  | 'accessibility'
  | 'priority'
  | 'requirements';

export type RescueFindingCode =
  | 'invalid-request'
  | 'budget-overrun'
  | 'budget-repairable'
  | 'protected-overrun'
  | 'budget-actual-overrun'
  | 'budget-empty'
  | 'guest-increase'
  | 'confirmed-attendance'
  | 'catering-recalculation'
  | 'protected-catering-held'
  | 'catering-missing'
  | 'catering-estimate-overrun'
  | 'catering-estimate-missing'
  | 'tasks-missing'
  | 'tasks-open'
  | 'schedule-data-missing'
  | 'task-after-event'
  | 'activity-overlap'
  | 'setting-missing'
  | 'outdoor-contingency-missing'
  | 'accessibility-unaddressed'
  | 'accessibility-missing'
  | 'protected-conflict'
  | 'repair-infeasible';

export interface RescueFinding {
  readonly id: string;
  readonly code: RescueFindingCode;
  readonly severity: RescueSeverity;
  readonly certainty: RescueCertainty;
  readonly area: RescueArea;
  readonly title: string;
  readonly description: string;
  readonly constraints: readonly string[];
  readonly recommendedAction: string;
  readonly explanation: string;
  readonly affectedCategoryIds: readonly string[];
}

export interface RescueRequirements {
  readonly startsAt: string;
  readonly expectedGuests: number;
  readonly totalAvailable: Money;
  readonly setting: EventSetting | null;
  readonly theme: string | null;
  readonly accessibilityRequired: boolean | null;
  readonly accessibilityAddressed: boolean | null;
  readonly contingencyPlanConfirmed: boolean | null;
}

export interface RescueRequestedChanges {
  readonly startsAt?: string;
  readonly expectedGuests?: number;
  readonly totalAvailable?: Money;
  readonly setting?: EventSetting | null;
  readonly theme?: string | null;
  readonly accessibilityRequired?: boolean | null;
  readonly accessibilityAddressed?: boolean | null;
  readonly contingencyPlanConfirmed?: boolean | null;
}

export interface RescueFlexibleCategory {
  readonly categoryId: string;
  readonly minimumPlanned: Money;
}

export interface RescueRequest {
  readonly eventId: string;
  readonly current: RescueRequirements;
  readonly changes: RescueRequestedChanges;
  readonly protectedCategoryIds: readonly string[];
  readonly flexibleCategories: readonly RescueFlexibleCategory[];
}

export type RescueValidationCode =
  | 'event-mismatch'
  | 'current-snapshot-stale'
  | 'invalid-date'
  | 'date-in-past'
  | 'invalid-guest-count'
  | 'invalid-total'
  | 'invalid-theme'
  | 'unknown-category'
  | 'duplicate-priority'
  | 'protected-flexible-conflict'
  | 'reserve-must-be-protected'
  | 'invalid-minimum'
  | 'invalid-proposal'
  | 'proposal-stale'
  | 'budget-overrun'
  | 'protected-reduction'
  | 'total-changed'
  | 'guest-count-changed'
  | 'date-changed'
  | 'requirements-changed'
  | 'invalid-event-fields';

export interface RescueValidationIssue {
  readonly code: RescueValidationCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly categoryId?: string;
}

export interface RescueValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly RescueValidationIssue[];
}

export type RescueChangeKind =
  | 'total-budget'
  | 'guest-count'
  | 'event-date'
  | 'setting'
  | 'theme'
  | 'accessibility'
  | 'contingency'
  | 'category-planned'
  | 'category-protection'
  | 'category-minimum';

export interface RescueChange {
  readonly id: string;
  readonly kind: RescueChangeKind;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly impact: string;
  readonly reversible: boolean;
}

export interface RescueProposal {
  readonly id: string;
  readonly eventId: string;
  readonly request: RescueRequest;
  readonly originalEvent: CelebrationEvent;
  readonly originalEventSignature: string;
  readonly proposedEvent: CelebrationEvent;
  readonly changes: readonly RescueChange[];
  readonly originalBudget: BudgetTotals;
  readonly proposedBudget: BudgetTotals;
  readonly protectedCategoryIds: readonly string[];
  readonly flexibleCategoryIds: readonly string[];
  readonly unresolvedIssues: readonly string[];
  readonly validation: RescueValidationResult;
  readonly createdAt: string;
}

export interface RescueResult {
  readonly eventId: string;
  readonly feasible: boolean;
  readonly findings: readonly RescueFinding[];
  readonly proposedChanges: readonly RescueChange[];
  readonly proposal: RescueProposal | null;
  readonly shortfall: Money;
  readonly explanation: string;
}

export interface RescueEngineInput {
  readonly event: CelebrationEvent;
  readonly tasks: readonly PlanningTask[];
  readonly activities?: readonly TimelineActivity[];
  readonly guests?: readonly Guest[];
  readonly cateringEstimate?: CateringEstimateConfig | null;
  readonly request: RescueRequest;
  readonly todayIso: string;
  readonly now?: Date;
}

export interface CateringAdjustment {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly originalPlanned: Money;
  readonly adjustedPlanned: Money;
  readonly reason: 'increased' | 'reduced' | 'protected-held' | 'minimum-clamped';
}

export interface RescueFindingInput {
  readonly event: CelebrationEvent;
  readonly tasks: readonly PlanningTask[];
  readonly activities: readonly TimelineActivity[];
  readonly guests: readonly Guest[];
  readonly cateringEstimate: CateringEstimateConfig | null;
  readonly effective: RescueRequirements;
  readonly originalTotals: BudgetTotals;
  readonly preRepairTotals: BudgetTotals;
  readonly protectedCategoryIds: readonly string[];
  readonly guestsChanged: boolean;
  readonly cateringUsable: boolean;
  readonly cateringAdjustments: readonly CateringAdjustment[];
  readonly repairFeasible: boolean;
  readonly repairShortfall: Money;
  readonly repairIssues: readonly string[];
  readonly repairReductionCount: number;
  readonly todayIso: string;
}

export type RescueApplyFailureCode =
  | 'not-found'
  | 'stale'
  | 'duplicate'
  | 'invalid'
  | 'persistence';

export type RescueApplyResult =
  | {
      readonly ok: true;
      readonly event: CelebrationEvent;
      readonly message: string;
    }
  | {
      readonly ok: false;
      readonly code: RescueApplyFailureCode;
      readonly message: string;
    };
