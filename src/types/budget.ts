import type { Money } from './domain';

export type BudgetFlexibility =
  | { readonly mode: 'protected' }
  | { readonly mode: 'flexible'; readonly minimumPlanned: Money };

export interface BudgetCategory {
  readonly id: string;
  readonly name: string;
  readonly planned: Money;
  readonly actual: Money;
  readonly flexibility: BudgetFlexibility;
  readonly notes?: string;
}

export interface EmergencyReserveConfig {
  readonly enabled: boolean;
  readonly target: Money;
}

export interface EventBudget {
  readonly id: string;
  readonly eventId: string;
  readonly totalAvailable: Money;
  readonly categories: readonly BudgetCategory[];
  readonly emergencyReserve: EmergencyReserveConfig;
  /** ISO 8601 timestamp. */
  readonly createdAt: string;
  /** ISO 8601 timestamp. */
  readonly updatedAt: string;
}

export type BudgetProtectionStatus = 'protected' | 'flexible' | 'mixed';
