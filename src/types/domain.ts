import type { EventBudget } from './budget';
import type { Money } from './money';
import type { RiskFinding, RiskProposalSnapshot } from './risk';

export type { CurrencyCode, Money } from './money';

export type EventCategory =
  | 'wedding'
  | 'birthday'
  | 'corporate'
  | 'anniversary'
  | 'festival'
  | 'other';

export type PlanningStatus = 'draft' | 'planning' | 'on-track' | 'at-risk' | 'completed';

export type DataOrigin = 'sample' | 'user';

export type EventSetting = 'indoor' | 'outdoor' | 'mixed';

export interface CelebrationEvent {
  readonly id: string;
  readonly name: string;
  readonly category: EventCategory;
  /** Calendar date in ISO 8601 form (YYYY-MM-DD). There is no time component. */
  readonly startsAt: string;
  readonly venue?: string;
  readonly expectedGuests: number;
  readonly budget: EventBudget;
  readonly status: PlanningStatus;
  readonly origin: DataOrigin;
  readonly setting?: EventSetting;
  readonly theme?: string;
  readonly accessibilityRequired?: boolean;
  readonly accessibilityAddressed?: boolean;
  readonly contingencyPlanConfirmed?: boolean;
  /** ISO 8601 timestamp of the last approved event-level change. */
  readonly updatedAt?: string;
}

export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskStatus = 'open' | 'completed';

export interface PlanningTask {
  readonly id: string;
  readonly eventId: string;
  readonly title: string;
  readonly description?: string;
  /** Calendar date in ISO 8601 form (YYYY-MM-DD). */
  readonly dueDate: string;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly assignee?: string;
  /** ISO 8601 timestamp. Legacy saved tasks may not have one. */
  readonly createdAt?: string;
  /** ISO 8601 timestamp. Legacy saved tasks may not have one. */
  readonly updatedAt?: string;
}

export type RsvpStatus = 'pending' | 'confirmed' | 'declined';

export interface Guest {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
  /** Retained for legacy records only. New guest forms do not collect it. */
  readonly email?: string;
  readonly rsvp: RsvpStatus;
  readonly dietaryPreference?: string;
  readonly accessibilityRequest?: string;
  readonly notes?: string;
  /** ISO 8601 timestamp. Legacy saved guests may not have one. */
  readonly createdAt?: string;
  /** ISO 8601 timestamp. Legacy saved guests may not have one. */
  readonly updatedAt?: string;
}

export type ActivityPriority = 'low' | 'medium' | 'high';

export type ActivityStatus = 'scheduled' | 'completed';

export interface TimelineActivity {
  readonly id: string;
  readonly eventId: string;
  readonly title: string;
  readonly description?: string;
  /** Local calendar date-time in YYYY-MM-DDTHH:mm form, with no timezone offset. */
  readonly startsAt: string;
  /** Local calendar date-time in YYYY-MM-DDTHH:mm form, with no timezone offset. */
  readonly endsAt: string;
  readonly priority: ActivityPriority;
  readonly status: ActivityStatus;
  readonly location?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CateringEstimateConfig {
  readonly eventId: string;
  readonly perPersonCost: Money;
  /** Whole percentage from 0 to 100. */
  readonly bufferPercent: number;
  readonly updatedAt: string;
}

export interface Workspace {
  readonly events: readonly CelebrationEvent[];
  readonly tasks: readonly PlanningTask[];
  readonly guests: readonly Guest[];
  readonly activities: readonly TimelineActivity[];
  readonly cateringEstimates: readonly CateringEstimateConfig[];
  /** Recalculated deterministically from workspace data; never a separate user input. */
  readonly riskFindings?: readonly RiskFinding[];
  /** Proposal summaries used to detect proposals evaluated against outdated events. */
  readonly rescueProposalSnapshots?: readonly RiskProposalSnapshot[];
}
