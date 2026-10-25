import { describe, expect, it, vi } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import {
  makeActivity,
  makeBudget,
  makeCategory,
  makeEvent,
  makeTask,
  makeWorkspace,
} from '@/test/fixtures';
import { makeAiPlan } from '@/test/aiFixtures';
import {
  buildAiEventContext,
  createAiContextSignature,
  createAiPlanId,
} from './aiContext';
import {
  approveAiPlan,
  type AiApprovalDependencies,
  type AiPlanProposal,
} from './aiApproval';
import type { AiPlan } from './contracts';

const now = new Date('2026-10-24T12:00:00.000Z');
const options = { todayIso: '2026-10-24', now } as const;

function makeApprovalWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const event = makeEvent({
    id: 'event-1',
    name: 'Test Celebration',
    startsAt: '2030-12-01',
    expectedGuests: 100,
    budget: makeBudget({
      eventId: 'event-1',
      totalAvailable: rupees(100_000),
      categories: [
        makeCategory({
          id: 'cat-venue',
          name: 'Venue',
          planned: rupees(40_000),
          flexibility: { mode: 'protected' },
        }),
        makeCategory({
          id: 'cat-catering',
          name: 'Catering',
          planned: rupees(20_000),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(15_000) },
        }),
      ],
    }),
  });

  return makeWorkspace({
    events: [event],
    tasks: [
      makeTask({
        id: 'existing-task',
        eventId: 'event-1',
        title: 'Existing preparation task',
      }),
    ],
    activities: [
      makeActivity({
        id: 'existing-activity',
        eventId: 'event-1',
        title: 'Existing ceremony',
      }),
    ],
    ...overrides,
  });
}

function makeProposal(
  workspace: Workspace,
  plan: AiPlan = makeAiPlan(),
): AiPlanProposal {
  const event = workspace.events[0]!;
  const built = buildAiEventContext(
    event,
    workspace,
    workspace.riskFindings ?? [],
  );

  if (!built.ok) {
    throw new Error(built.message);
  }

  const contextSignature = createAiContextSignature(built.context);

  return {
    planId: createAiPlanId(event.id, contextSignature, plan),
    eventId: event.id,
    requestId: 'req-test-1',
    generatedAt: '2026-10-24T10:00:00.000Z',
    source: 'provider',
    contextSignature,
    request: {
      mode: 'create-plan',
      message: 'Plan a wedding for 100 guests.',
      event: built.context,
    },
    plan,
    timelineIndexes: [0],
    taskIndexes: [0],
  };
}

function makeDependencies(
  overrides: Partial<AiApprovalDependencies> = {},
): {
  readonly dependencies: AiApprovalDependencies;
  readonly persist: ReturnType<typeof vi.fn>;
  readonly prepare: ReturnType<typeof vi.fn>;
} {
  const persist = vi.fn(
    (): { ok: true } | { ok: false; message: string } => ({ ok: true }),
  );
  const prepare = vi.fn((next: Workspace) => next);
  const dependencies: AiApprovalDependencies = {
    persist,
    isDuplicate: () => false,
    prepare,
    ...overrides,
  };

  return { dependencies, persist, prepare };
}

describe('AI plan approval', () => {
  it('adds only the selected additions and never rewrites existing data', () => {
    const workspace = makeApprovalWorkspace();
    const proposal = makeProposal(workspace);
    const { dependencies, persist, prepare } = makeDependencies();
    const outcome = approveAiPlan(workspace, proposal, dependencies, options);

    expect(outcome.result.ok).toBe(true);

    if (!outcome.result.ok) {
      return;
    }

    expect(outcome.result.appliedTasks).toBe(1);
    expect(outcome.result.appliedActivities).toBe(1);
    expect(outcome.result.message).toContain('1 task');
    expect(outcome.result.message).toContain('1 timeline activity');
    expect(outcome.workspace.tasks).toHaveLength(2);
    expect(outcome.workspace.activities).toHaveLength(2);
    expect(outcome.workspace.events).toBe(workspace.events);
    expect(outcome.workspace.guests).toBe(workspace.guests);
    expect(outcome.workspace.events[0]!.budget).toBe(workspace.events[0]!.budget);

    const addedTask = outcome.workspace.tasks[0]!;
    const addedActivity = outcome.workspace.activities[0]!;
    expect(addedTask).toMatchObject({
      eventId: 'event-1',
      title: 'Confirm final seating plan',
      status: 'open',
      dueDate: '2030-11-20',
    });
    expect(addedActivity).toMatchObject({
      eventId: 'event-1',
      title: 'Guest welcome',
      status: 'scheduled',
      startsAt: '2030-12-01T17:00',
    });
    expect(addedTask.createdAt).toBe(now.toISOString());
    expect(addedActivity.updatedAt).toBe(now.toISOString());
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(outcome.workspace);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('requires at least one explicit selection', () => {
    const workspace = makeApprovalWorkspace();
    const proposal = {
      ...makeProposal(workspace),
      timelineIndexes: [],
      taskIndexes: [],
    };
    const { dependencies, persist } = makeDependencies();
    const outcome = approveAiPlan(workspace, proposal, dependencies, options);

    expect(outcome.result).toMatchObject({ ok: false, code: 'empty' });
    expect(outcome.workspace).toBe(workspace);
    expect(persist).not.toHaveBeenCalled();
  });

  it('rejects a plan that was already applied', () => {
    const workspace = makeApprovalWorkspace();
    const proposal = makeProposal(workspace);
    const { dependencies, persist } = makeDependencies({ isDuplicate: () => true });
    const outcome = approveAiPlan(workspace, proposal, dependencies, options);

    expect(outcome.result).toMatchObject({ ok: false, code: 'duplicate' });
    expect(outcome.workspace).toBe(workspace);
    expect(persist).not.toHaveBeenCalled();
  });

  it('rejects a stale plan after any relevant workspace change', () => {
    const workspace = makeApprovalWorkspace();
    const proposal = makeProposal(workspace);
    const changed: Workspace = {
      ...workspace,
      events: workspace.events.map((event) =>
        event.id === 'event-1'
          ? {
              ...event,
              budget: {
                ...event.budget,
                totalAvailable: rupees(120_000),
              },
            }
          : event,
      ),
    };
    const { dependencies, persist } = makeDependencies();
    const outcome = approveAiPlan(changed, proposal, dependencies, options);

    expect(outcome.result).toMatchObject({ ok: false, code: 'stale' });
    expect(outcome.workspace).toBe(changed);
    expect(persist).not.toHaveBeenCalled();
  });

  it('rejects a plan whose event was removed or whose identity was altered', () => {
    const workspace = makeApprovalWorkspace();
    const proposal = makeProposal(workspace);
    const { dependencies, persist } = makeDependencies();
    const removed = approveAiPlan(
      makeWorkspace(),
      proposal,
      dependencies,
      options,
    );

    expect(removed.result).toMatchObject({ ok: false, code: 'not-found' });

    const tampered: AiPlanProposal = {
      ...proposal,
      plan: { ...proposal.plan, overview: 'A silently altered proposal.' },
    };
    const altered = approveAiPlan(
      workspace,
      tampered,
      dependencies,
      options,
    );

    expect(altered.result).toMatchObject({ ok: false, code: 'invalid' });
    expect(altered.workspace).toBe(workspace);
    expect(persist).not.toHaveBeenCalled();
  });

  it('rejects out-of-range or duplicate selections', () => {
    const workspace = makeApprovalWorkspace();
    const proposal = makeProposal(workspace);
    const { dependencies, persist } = makeDependencies();
    const outOfRange = approveAiPlan(
      workspace,
      { ...proposal, taskIndexes: [9] },
      dependencies,
      options,
    );
    const duplicated = approveAiPlan(
      workspace,
      { ...proposal, taskIndexes: [0, 0] },
      dependencies,
      options,
    );

    expect(outOfRange.result).toMatchObject({ ok: false, code: 'invalid' });
    expect(duplicated.result).toMatchObject({ ok: false, code: 'invalid' });
    expect(persist).not.toHaveBeenCalled();
  });

  it('blocks a selected task that duplicates an existing saved title', () => {
    const workspace = makeApprovalWorkspace({
      tasks: [
        makeTask({
          id: 'existing-task',
          eventId: 'event-1',
          title: 'Confirm final seating plan',
        }),
      ],
    });
    const proposal = makeProposal(workspace);
    const { dependencies, persist } = makeDependencies();
    const outcome = approveAiPlan(workspace, proposal, dependencies, options);

    expect(outcome.result).toMatchObject({ ok: false, code: 'invalid' });
    expect(outcome.result.ok ? '' : outcome.result.message).toContain(
      'same title as an existing task',
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it('never applies advisory budget changes, including protected categories', () => {
    const workspace = makeApprovalWorkspace();
    const plan = makeAiPlan();
    plan.budgetCategories = [
      {
        name: 'Venue',
        plannedMinor: 1_000_000,
        rationale: 'A lower venue allocation suggested for review.',
        priority: 'optional',
      },
    ];
    const proposal = makeProposal(workspace, plan);
    const { dependencies } = makeDependencies();
    const outcome = approveAiPlan(workspace, proposal, dependencies, options);

    expect(outcome.result.ok).toBe(true);
    expect(outcome.workspace.events[0]!.budget).toBe(workspace.events[0]!.budget);
    expect(outcome.workspace.events[0]!.budget.categories).toEqual(
      workspace.events[0]!.budget.categories,
    );
    expect(outcome.result.ok ? outcome.result.message : '').toContain(
      'Budgets, guests, protected allocations',
    );
  });

  it('leaves the workspace untouched when persistence fails', () => {
    const workspace = makeApprovalWorkspace();
    const proposal = makeProposal(workspace);
    const failingPersist = vi.fn(
      (): { ok: true } | { ok: false; message: string } => ({
        ok: false,
        message: 'Storage is unavailable.',
      }),
    );
    const { dependencies } = makeDependencies({ persist: failingPersist });
    const outcome = approveAiPlan(workspace, proposal, dependencies, options);

    expect(outcome.result).toMatchObject({
      ok: false,
      code: 'persistence',
      message: 'Storage is unavailable.',
    });
    expect(outcome.workspace).toBe(workspace);
    expect(failingPersist).toHaveBeenCalledTimes(1);
  });
});
