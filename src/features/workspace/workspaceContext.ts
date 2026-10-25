import { createContext, useContext } from 'react';
import type { BudgetCategory, EmergencyReserveConfig } from '@/types/budget';
import type {
  CelebrationEvent,
  Guest,
  Money,
  PlanningTask,
  TimelineActivity,
  Workspace,
} from '@/types/domain';
import type { EventDraft } from '@/features/events/eventMutations';
import type { ActivityDraft } from '@/features/timeline/activityRules';
import type { TaskDraft } from '@/features/tasks/taskRules';
import type { GuestDraft } from '@/features/guests/guestRules';
import type { RescueApplyResult, RescueProposal } from '@/features/rescue/rescueTypes';
import type { AiApplyResult, AiPlanProposal } from '@/features/ai/aiApproval';
import type { RiskActionResult } from '@/features/risks/riskTypes';
import type {
  ExportWorkspaceResult,
  ImportWorkspaceResult,
} from './workspaceStorage';

export type WorkspacePersistenceStatus =
  | 'local'
  | 'load-partial'
  | 'load-failed'
  | 'save-failed'
  | 'unavailable';

export interface WorkspacePersistence {
  readonly status: WorkspacePersistenceStatus;
  readonly message: string;
}

export interface WorkspaceContextValue {
  readonly workspace: Workspace;
  readonly hasSampleData: boolean;
  readonly persistence: WorkspacePersistence;
  readonly createEvent: (draft: EventDraft) => CelebrationEvent;
  readonly updateEvent: (eventId: string, draft: EventDraft) => void;
  readonly toggleTask: (taskId: string) => void;
  readonly createTask: (eventId: string, draft: TaskDraft) => PlanningTask;
  readonly updateTask: (taskId: string, draft: TaskDraft) => void;
  readonly deleteTask: (eventId: string, taskId: string) => void;
  readonly createActivity: (eventId: string, draft: ActivityDraft) => TimelineActivity;
  readonly updateActivity: (activityId: string, draft: ActivityDraft) => void;
  readonly deleteActivity: (eventId: string, activityId: string) => void;
  readonly toggleActivity: (activityId: string) => void;
  readonly createGuest: (eventId: string, draft: GuestDraft) => Guest;
  readonly updateGuest: (guestId: string, draft: GuestDraft) => void;
  readonly deleteGuest: (eventId: string, guestId: string) => void;
  readonly saveCateringEstimate: (
    eventId: string,
    perPersonCost: Money,
    bufferPercent: number,
  ) => void;
  readonly loadDemoData: () => void;
  readonly removeDemoData: () => void;
  readonly updateBudgetTotal: (eventId: string, totalAvailable: Money) => void;
  readonly saveBudgetCategory: (eventId: string, category: BudgetCategory) => void;
  readonly removeBudgetCategory: (eventId: string, categoryId: string) => void;
  readonly applyBudgetRepair: (
    eventId: string,
    categories: readonly BudgetCategory[],
  ) => void;
  readonly updateEmergencyReserve: (
    eventId: string,
    reserve: EmergencyReserveConfig,
  ) => void;
  readonly applyRescueProposal: (proposal: RescueProposal) => RescueApplyResult;
  /**
   * Adds only the selected AI-suggested tasks and activities after revalidating
   * the plan against the latest workspace. Never changes budgets or guests.
   */
  readonly applyAiPlan: (proposal: AiPlanProposal) => AiApplyResult;
  /** Safe messages from deterministic checks that could not run, never record contents. */
  readonly riskAnalysisErrors: readonly string[];
  readonly dismissRiskFinding: (findingId: string) => RiskActionResult;
  readonly restoreRiskFinding: (findingId: string) => RiskActionResult;
  readonly refreshRiskAnalysis: () => RiskActionResult;
  readonly recordRescueProposal: (proposal: RescueProposal) => void;
  readonly clearRescueProposal: (eventId: string) => void;
  /** Validated JSON snapshot for the user to download. Contains local workspace data. */
  readonly exportWorkspace: () => ExportWorkspaceResult;
  /** Validates the whole file before replacing anything; requires explicit UI confirmation. */
  readonly importWorkspace: (raw: string) => ImportWorkspaceResult;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider.');
  }

  return context;
}
