import { useCallback, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { toIsoDate } from '@/lib/date';
import { createId } from '@/lib/id';
import type { BudgetCategory, EmergencyReserveConfig } from '@/types/budget';
import type {
  Guest,
  Money,
  PlanningTask,
  TimelineActivity,
  Workspace,
} from '@/types/domain';
import {
  createUserEvent,
  updateUserEvent,
  type EventDraft,
} from '@/features/events/eventMutations';
import { normalizeActivityDraft, type ActivityDraft } from '@/features/timeline/activityRules';
import { normalizeTaskDraft, type TaskDraft } from '@/features/tasks/taskRules';
import { normalizeGuestDraft, type GuestDraft } from '@/features/guests/guestRules';
import { approveRescueProposal } from '@/features/rescue/rescueApproval';
import type {
  RescueApplyResult,
  RescueProposal,
} from '@/features/rescue/rescueTypes';
import { approveAiPlan, type AiApplyResult, type AiPlanProposal } from '@/features/ai/aiApproval';
import {
  dismissRiskFinding as dismissStoredRiskFinding,
  restoreRiskFinding as restoreStoredRiskFinding,
} from '@/features/risks/riskReconciliation';
import { applyRiskAnalysis, replaceRiskFindings } from '@/features/risks/riskState';
import type { RiskActionResult } from '@/features/risks/riskTypes';
import {
  withRecordedProposalSnapshot,
  withoutProposalSnapshot,
} from '@/features/risks/proposalSnapshot';
import { createDemoWorkspace } from './demoData';
import {
  WorkspaceContext,
  type WorkspaceContextValue,
  type WorkspacePersistence,
} from './workspaceContext';
import { workspaceReducer, type WorkspaceAction } from './workspaceReducer';
import {
  exportWorkspaceToJson,
  importWorkspaceFromJson,
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
  type ImportWorkspaceResult,
} from './workspaceStorage';

interface WorkspaceProviderProps {
  readonly children: ReactNode;
  readonly initialState?: Workspace;
}

interface WorkspaceBootstrap {
  readonly workspace: Workspace;
  readonly persistence: WorkspacePersistence;
  readonly riskAnalysisErrors: readonly string[];
}

const localPersistence: WorkspacePersistence = {
  status: 'local',
  message: 'Changes are saved in this browser.',
};

const riskFailureMessage =
  'Risk analysis could not complete. Your saved changes are intact, but risk findings may be out of date.';

function analyzeAtBoundary(
  workspace: Workspace,
  now: Date,
): { workspace: Workspace; errors: readonly string[] } {
  try {
    const result = applyRiskAnalysis(workspace, {
      todayIso: toIsoDate(now),
      now,
    });

    return {
      workspace: result.workspace,
      errors: result.analysis.errors.map((entry) => entry.message),
    };
  } catch {
    return { workspace, errors: [riskFailureMessage] };
  }
}

function finalizeBootstrap(
  workspace: Workspace,
  persistence: WorkspacePersistence,
): WorkspaceBootstrap {
  const analyzed = analyzeAtBoundary(workspace, new Date());

  return {
    workspace: analyzed.workspace,
    persistence,
    riskAnalysisErrors: analyzed.errors,
  };
}

type ApprovalResultShape =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string };

interface ApprovalOutcomeShape<TResult extends ApprovalResultShape> {
  readonly result: TResult;
  readonly workspace: Workspace;
}

interface ApprovalCommitOptions {
  readonly approvedIds: Set<string>;
  readonly approvedId: string;
  readonly replaceWorkspace: (workspace: Workspace) => void;
  readonly setPersistence: (persistence: WorkspacePersistence) => void;
}

/**
 * Shared post-approval invariant for rescue proposals and AI plans: an
 * approved change reaches in-memory state only after its atomic save
 * succeeded, and a failed save surfaces `save-failed` without mutating the
 * workspace or recording the approval as applied.
 */
function commitApproval<TResult extends ApprovalResultShape>(
  outcome: ApprovalOutcomeShape<TResult>,
  options: ApprovalCommitOptions,
): TResult {
  if (outcome.result.ok) {
    options.approvedIds.add(options.approvedId);
    options.replaceWorkspace(outcome.workspace);
    options.setPersistence(localPersistence);
  } else if (outcome.result.code === 'persistence') {
    options.setPersistence({
      status: 'save-failed',
      message: outcome.result.message,
    });
  }

  return outcome.result;
}

function createBootstrap(initialState?: Workspace): WorkspaceBootstrap {
  if (initialState) {
    return finalizeBootstrap(initialState, localPersistence);
  }

  const loaded = loadWorkspaceFromStorage();

  if (loaded.status === 'loaded') {
    return finalizeBootstrap(loaded.workspace, localPersistence);
  }

  if (loaded.status === 'partial') {
    return finalizeBootstrap(loaded.workspace, {
      status: 'load-partial',
      message: loaded.message,
    });
  }

  if (loaded.status === 'invalid') {
    return finalizeBootstrap(createDemoWorkspace(), {
      status: 'load-failed',
      message: `${loaded.message} Sample data is shown so you can keep working; your saved data was not overwritten.`,
    });
  }

  if (loaded.status === 'unavailable') {
    return finalizeBootstrap(createDemoWorkspace(), {
      status: 'unavailable',
      message: loaded.message,
    });
  }

  return finalizeBootstrap(createDemoWorkspace(), localPersistence);
}

function timestamp(): string {
  return new Date().toISOString();
}

export function WorkspaceProvider({ children, initialState }: WorkspaceProviderProps) {
  const [bootstrap] = useState(() => createBootstrap(initialState));
  const [workspace, dispatch] = useReducer(workspaceReducer, bootstrap.workspace);
  const [persistence, setPersistence] = useState(bootstrap.persistence);
  const [riskAnalysisErrors, setRiskAnalysisErrors] = useState<readonly string[]>(
    bootstrap.riskAnalysisErrors,
  );
  const workspaceRef = useRef(workspace);
  const approvedProposalIdsRef = useRef(new Set<string>());
  const approvedAiPlanIdsRef = useRef(new Set<string>());

  const persistWorkspace = useCallback(
    (next: Workspace) => {
      if (initialState) {
        return;
      }

      const result = saveWorkspaceToStorage(next);
      setPersistence(
        result.ok
          ? localPersistence
          : { status: 'save-failed', message: result.message },
      );
    },
    [initialState],
  );

  const replaceWorkspace = useCallback(
    (next: Workspace) => {
      workspaceRef.current = next;
      dispatch({ type: 'workspace/replaced', workspace: next });
    },
    [dispatch],
  );

  // Persist at mutation time rather than in an effect. The ref keeps sequential
  // actions in the same tick building on the latest state, and the provider still
  // derives state through the reducer.
  const commit = useCallback(
    (action: WorkspaceAction) => {
      const reduced = workspaceReducer(workspaceRef.current, action);

      if (reduced === workspaceRef.current) {
        return;
      }

      const analyzed = analyzeAtBoundary(reduced, new Date());
      setRiskAnalysisErrors(analyzed.errors);
      replaceWorkspace(analyzed.workspace);
      persistWorkspace(analyzed.workspace);
    },
    [persistWorkspace, replaceWorkspace],
  );

  const commitRiskStatus = useCallback(
    (next: Workspace) => {
      replaceWorkspace(next);
      persistWorkspace(next);
    },
    [persistWorkspace, replaceWorkspace],
  );

  const dismissRiskFinding = useCallback(
    (findingId: string): RiskActionResult => {
      const mutation = dismissStoredRiskFinding(
        workspaceRef.current.riskFindings ?? [],
        findingId,
        new Date(),
      );

      if (mutation.result.ok) {
        commitRiskStatus(
          replaceRiskFindings(workspaceRef.current, mutation.findings),
        );
      }

      return mutation.result;
    },
    [commitRiskStatus],
  );

  const restoreRiskFinding = useCallback(
    (findingId: string): RiskActionResult => {
      const mutation = restoreStoredRiskFinding(
        workspaceRef.current.riskFindings ?? [],
        findingId,
        new Date(),
      );

      if (mutation.result.ok) {
        commitRiskStatus(
          replaceRiskFindings(workspaceRef.current, mutation.findings),
        );
      }

      return mutation.result;
    },
    [commitRiskStatus],
  );

  const refreshRiskAnalysis = useCallback((): RiskActionResult => {
    const now = new Date();

    try {
      const result = applyRiskAnalysis(workspaceRef.current, {
        todayIso: toIsoDate(now),
        now,
      });
      const openCount = result.reconciliation.findings.filter(
        (finding) => finding.status === 'open',
      ).length;

      setRiskAnalysisErrors(result.analysis.errors.map((entry) => entry.message));
      commitRiskStatus(result.workspace);

      return {
        ok: true,
        message: `Risk analysis refreshed. ${openCount} open ${
          openCount === 1 ? 'finding' : 'findings'
        } recorded.`,
      };
    } catch {
      setRiskAnalysisErrors([riskFailureMessage]);
      return { ok: false, message: riskFailureMessage };
    }
  }, [commitRiskStatus]);

  const recordRescueProposal = useCallback(
    (proposal: RescueProposal) => {
      const candidate = withRecordedProposalSnapshot(
        workspaceRef.current,
        proposal,
      );
      const analyzed = analyzeAtBoundary(candidate, new Date());

      setRiskAnalysisErrors(analyzed.errors);
      replaceWorkspace(analyzed.workspace);
      persistWorkspace(analyzed.workspace);
    },
    [persistWorkspace, replaceWorkspace],
  );

  const clearRescueProposal = useCallback(
    (eventId: string) => {
      const snapshots = workspaceRef.current.rescueProposalSnapshots ?? [];

      if (!snapshots.some((snapshot) => snapshot.eventId === eventId)) {
        return;
      }

      const candidate = withoutProposalSnapshot(workspaceRef.current, eventId);
      const analyzed = analyzeAtBoundary(candidate, new Date());

      setRiskAnalysisErrors(analyzed.errors);
      replaceWorkspace(analyzed.workspace);
      persistWorkspace(analyzed.workspace);
    },
    [persistWorkspace, replaceWorkspace],
  );

  const exportWorkspace = useCallback(
    () => exportWorkspaceToJson(workspaceRef.current),
    [],
  );

  const importWorkspace = useCallback(
    (raw: string): ImportWorkspaceResult => {
      const parsed = importWorkspaceFromJson(raw);

      if (!parsed.ok) {
        return parsed;
      }

      const analyzed = analyzeAtBoundary(parsed.workspace, new Date());
      setRiskAnalysisErrors(analyzed.errors);

      if (!initialState) {
        const saved = saveWorkspaceToStorage(analyzed.workspace);

        if (!saved.ok) {
          setPersistence({ status: 'save-failed', message: saved.message });
          return {
            ok: false,
            message: `The file is valid, but it could not be saved to this browser. Nothing was imported. ${saved.message}`,
          };
        }
      }

      approvedProposalIdsRef.current = new Set();
      approvedAiPlanIdsRef.current = new Set();
      replaceWorkspace(analyzed.workspace);
      setPersistence(localPersistence);

      return { ok: true, workspace: analyzed.workspace };
    },
    [initialState, replaceWorkspace],
  );

  const createEvent = useCallback(
    (draft: EventDraft) => {
      const event = createUserEvent(draft, createId('event'));
      commit({ type: 'event/created', event });
      return event;
    },
    [commit],
  );

  const updateEvent = useCallback(
    (eventId: string, draft: EventDraft) => {
      const existing = workspaceRef.current.events.find(
        (event) => event.id === eventId,
      );

      if (!existing) {
        return;
      }

      commit({ type: 'event/updated', event: updateUserEvent(existing, draft) });
    },
    [commit],
  );

  const deleteEvent = useCallback(
    (eventId: string) => {
      commit({ type: 'event/deleted', eventId });
    },
    [commit],
  );

  const toggleTask = useCallback(
    (taskId: string) => {
      const task = workspaceRef.current.tasks.find((entry) => entry.id === taskId);

      if (!task) {
        return;
      }

      commit({
        type: 'task/toggled',
        taskId,
        status: task.status === 'open' ? 'completed' : 'open',
        updatedAt: timestamp(),
      });
    },
    [commit],
  );

  const createTask = useCallback(
    (eventId: string, draft: TaskDraft): PlanningTask => {
      const normalized = normalizeTaskDraft(draft);
      const now = timestamp();
      const task: PlanningTask = {
        id: createId('task'),
        eventId,
        title: normalized.title,
        dueDate: normalized.dueDate,
        priority: normalized.priority,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        ...(normalized.description ? { description: normalized.description } : {}),
        ...(normalized.assignee ? { assignee: normalized.assignee } : {}),
      };

      commit({ type: 'task/created', task });
      return task;
    },
    [commit],
  );

  const updateTask = useCallback(
    (taskId: string, draft: TaskDraft) => {
      const existing = workspaceRef.current.tasks.find((task) => task.id === taskId);

      if (!existing) {
        return;
      }

      const normalized = normalizeTaskDraft(draft);
      const task: PlanningTask = {
        id: existing.id,
        eventId: existing.eventId,
        title: normalized.title,
        dueDate: normalized.dueDate,
        priority: normalized.priority,
        status: existing.status,
        ...(typeof existing.createdAt === 'undefined'
          ? {}
          : { createdAt: existing.createdAt }),
        ...(normalized.description ? { description: normalized.description } : {}),
        ...(normalized.assignee ? { assignee: normalized.assignee } : {}),
        updatedAt: timestamp(),
      };

      commit({ type: 'task/updated', task });
    },
    [commit],
  );

  const deleteTask = useCallback(
    (eventId: string, taskId: string) => {
      commit({ type: 'task/deleted', eventId, taskId });
    },
    [commit],
  );

  const createActivity = useCallback(
    (eventId: string, draft: ActivityDraft): TimelineActivity => {
      const normalized = normalizeActivityDraft(draft);
      const now = timestamp();
      const activity: TimelineActivity = {
        id: createId('activity'),
        eventId,
        title: normalized.title,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        priority: normalized.priority,
        status: normalized.status,
        createdAt: now,
        updatedAt: now,
        ...(normalized.description ? { description: normalized.description } : {}),
        ...(normalized.location ? { location: normalized.location } : {}),
      };

      commit({ type: 'activity/created', activity });
      return activity;
    },
    [commit],
  );

  const updateActivity = useCallback(
    (activityId: string, draft: ActivityDraft) => {
      const existing = workspaceRef.current.activities.find(
        (activity) => activity.id === activityId,
      );

      if (!existing) {
        return;
      }

      const normalized = normalizeActivityDraft(draft);
      const activity: TimelineActivity = {
        id: existing.id,
        eventId: existing.eventId,
        title: normalized.title,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        priority: normalized.priority,
        status: normalized.status,
        createdAt: existing.createdAt,
        updatedAt: timestamp(),
        ...(normalized.description ? { description: normalized.description } : {}),
        ...(normalized.location ? { location: normalized.location } : {}),
      };

      commit({ type: 'activity/updated', activity });
    },
    [commit],
  );

  const deleteActivity = useCallback(
    (eventId: string, activityId: string) => {
      commit({ type: 'activity/deleted', eventId, activityId });
    },
    [commit],
  );

  const toggleActivity = useCallback(
    (activityId: string) => {
      const activity = workspaceRef.current.activities.find(
        (entry) => entry.id === activityId,
      );

      if (!activity) {
        return;
      }

      commit({
        type: 'activity/toggled',
        activityId,
        status: activity.status === 'scheduled' ? 'completed' : 'scheduled',
        updatedAt: timestamp(),
      });
    },
    [commit],
  );

  const createGuest = useCallback(
    (eventId: string, draft: GuestDraft): Guest => {
      const normalized = normalizeGuestDraft(draft);
      const now = timestamp();
      const guest: Guest = {
        id: createId('guest'),
        eventId,
        name: normalized.name,
        rsvp: normalized.rsvp,
        createdAt: now,
        updatedAt: now,
        ...(normalized.dietaryPreference
          ? { dietaryPreference: normalized.dietaryPreference }
          : {}),
        ...(normalized.accessibilityRequest
          ? { accessibilityRequest: normalized.accessibilityRequest }
          : {}),
        ...(normalized.notes ? { notes: normalized.notes } : {}),
      };

      commit({ type: 'guest/created', guest });
      return guest;
    },
    [commit],
  );

  const updateGuest = useCallback(
    (guestId: string, draft: GuestDraft) => {
      const existing = workspaceRef.current.guests.find((guest) => guest.id === guestId);

      if (!existing) {
        return;
      }

      const normalized = normalizeGuestDraft(draft);
      const guest: Guest = {
        id: existing.id,
        eventId: existing.eventId,
        name: normalized.name,
        rsvp: normalized.rsvp,
        ...(typeof existing.email === 'undefined' ? {} : { email: existing.email }),
        ...(typeof existing.createdAt === 'undefined'
          ? {}
          : { createdAt: existing.createdAt }),
        ...(normalized.dietaryPreference
          ? { dietaryPreference: normalized.dietaryPreference }
          : {}),
        ...(normalized.accessibilityRequest
          ? { accessibilityRequest: normalized.accessibilityRequest }
          : {}),
        ...(normalized.notes ? { notes: normalized.notes } : {}),
        updatedAt: timestamp(),
      };

      commit({ type: 'guest/updated', guest });
    },
    [commit],
  );

  const deleteGuest = useCallback(
    (eventId: string, guestId: string) => {
      commit({ type: 'guest/deleted', eventId, guestId });
    },
    [commit],
  );

  const saveCateringEstimate = useCallback(
    (eventId: string, perPersonCost: Money, bufferPercent: number) => {
      if (
        perPersonCost.currency !== 'INR' ||
        !Number.isSafeInteger(perPersonCost.amountMinor) ||
        perPersonCost.amountMinor < 0 ||
        !Number.isSafeInteger(bufferPercent) ||
        bufferPercent < 0 ||
        bufferPercent > 100
      ) {
        return;
      }

      commit({
        type: 'catering/estimate-saved',
        estimate: {
          eventId,
          perPersonCost: { ...perPersonCost },
          bufferPercent,
          updatedAt: timestamp(),
        },
      });
    },
    [commit],
  );

  const loadDemoData = useCallback(() => {
    commit({ type: 'demo/loaded', seed: createDemoWorkspace() });
  }, [commit]);

  const removeDemoData = useCallback(() => {
    commit({ type: 'demo/removed' });
  }, [commit]);

  const updateBudgetTotal = useCallback(
    (eventId: string, totalAvailable: Money) => {
      commit({
        type: 'budget/total-updated',
        eventId,
        totalAvailable,
        updatedAt: timestamp(),
      });
    },
    [commit],
  );

  const saveBudgetCategory = useCallback(
    (eventId: string, category: BudgetCategory) => {
      commit({
        type: 'budget/category-upserted',
        eventId,
        category,
        updatedAt: timestamp(),
      });
    },
    [commit],
  );

  const removeBudgetCategory = useCallback(
    (eventId: string, categoryId: string) => {
      commit({
        type: 'budget/category-removed',
        eventId,
        categoryId,
        updatedAt: timestamp(),
      });
    },
    [commit],
  );

  const applyBudgetRepair = useCallback(
    (eventId: string, categories: readonly BudgetCategory[]) => {
      commit({
        type: 'budget/categories-replaced',
        eventId,
        categories,
        updatedAt: timestamp(),
      });
    },
    [commit],
  );

  const updateEmergencyReserve = useCallback(
    (eventId: string, reserve: EmergencyReserveConfig) => {
      commit({
        type: 'budget/reserve-updated',
        eventId,
        reserve,
        updatedAt: timestamp(),
      });
    },
    [commit],
  );

  const applyRescueProposal = useCallback(
    (proposal: RescueProposal): RescueApplyResult => {
      const now = new Date();
      const outcome = approveRescueProposal(
        workspaceRef.current,
        proposal,
        {
          persist: initialState
            ? () => ({ ok: true })
            : (nextWorkspace) => saveWorkspaceToStorage(nextWorkspace),
          isDuplicate: (proposalId) =>
            approvedProposalIdsRef.current.has(proposalId),
          prepare: (candidate) => analyzeAtBoundary(candidate, now).workspace,
        },
        { todayIso: toIsoDate(now), now },
      );

      if (outcome.result.ok && !outcome.action) {
        return {
          ok: false,
          code: 'invalid',
          message: 'The approved proposal produced no change. Nothing was saved.',
        };
      }

      return commitApproval(outcome, {
        approvedIds: approvedProposalIdsRef.current,
        approvedId: proposal.id,
        replaceWorkspace,
        setPersistence,
      });
    },
    [initialState, replaceWorkspace],
  );

  const applyAiPlan = useCallback(
    (proposal: AiPlanProposal): AiApplyResult => {
      const now = new Date();
      const outcome = approveAiPlan(
        workspaceRef.current,
        proposal,
        {
          persist: initialState
            ? () => ({ ok: true })
            : (nextWorkspace) => saveWorkspaceToStorage(nextWorkspace),
          isDuplicate: (planId) =>
            approvedAiPlanIdsRef.current.has(planId),
          prepare: (candidate) => analyzeAtBoundary(candidate, now).workspace,
        },
        { todayIso: toIsoDate(now), now },
      );

      return commitApproval(outcome, {
        approvedIds: approvedAiPlanIdsRef.current,
        approvedId: proposal.planId,
        replaceWorkspace,
        setPersistence,
      });
    },
    [initialState, replaceWorkspace],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      hasSampleData: workspace.events.some((event) => event.origin === 'sample'),
      persistence,
      createEvent,
      updateEvent,
      deleteEvent,
      toggleTask,
      createTask,
      updateTask,
      deleteTask,
      createActivity,
      updateActivity,
      deleteActivity,
      toggleActivity,
      createGuest,
      updateGuest,
      deleteGuest,
      saveCateringEstimate,
      loadDemoData,
      removeDemoData,
      updateBudgetTotal,
      saveBudgetCategory,
      removeBudgetCategory,
      applyBudgetRepair,
      updateEmergencyReserve,
      applyRescueProposal,
      applyAiPlan,
      riskAnalysisErrors,
      dismissRiskFinding,
      restoreRiskFinding,
      refreshRiskAnalysis,
      recordRescueProposal,
      clearRescueProposal,
      exportWorkspace,
      importWorkspace,
    }),
    [
      workspace,
      persistence,
      riskAnalysisErrors,
      createEvent,
      updateEvent,
      deleteEvent,
      toggleTask,
      createTask,
      updateTask,
      deleteTask,
      createActivity,
      updateActivity,
      deleteActivity,
      toggleActivity,
      createGuest,
      updateGuest,
      deleteGuest,
      saveCateringEstimate,
      loadDemoData,
      removeDemoData,
      updateBudgetTotal,
      saveBudgetCategory,
      removeBudgetCategory,
      applyBudgetRepair,
      updateEmergencyReserve,
      applyRescueProposal,
      applyAiPlan,
      dismissRiskFinding,
      restoreRiskFinding,
      refreshRiskAnalysis,
      recordRescueProposal,
      clearRescueProposal,
      exportWorkspace,
      importWorkspace,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
