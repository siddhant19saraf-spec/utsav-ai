import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import { makeBudget, makeCategory, makeEvent, makeWorkspace } from '@/test/fixtures';
import { workspaceReducer } from '@/features/workspace/workspaceReducer';
import { approveRescueProposal } from './rescueApproval';
import { analyzeEventRescue } from './rescueEngine';
import type { RescueProposal, RescueRequest } from './rescueTypes';
import { requirementsFromEvent } from './rescueValidation';

const TODAY = '2026-10-24';
const NOW = new Date('2026-10-24T12:34:56.000Z');
const NOW_ISO = NOW.toISOString();

function baseCategories() {
  return [
    makeCategory({
      id: 'venue',
      name: 'Venue',
      planned: rupees(6_000),
      actual: rupees(0),
      flexibility: { mode: 'protected' },
    }),
    makeCategory({
      id: 'catering',
      name: 'Catering',
      planned: rupees(2_000),
      actual: rupees(0),
      flexibility: { mode: 'flexible', minimumPlanned: rupees(1_500) },
    }),
    makeCategory({
      id: 'decor',
      name: 'Décor',
      planned: rupees(3_000),
      actual: rupees(0),
      flexibility: { mode: 'flexible', minimumPlanned: rupees(2_000) },
    }),
  ];
}

function savedEvent() {
  return makeEvent({
    id: 'event-1',
    name: 'Wedding',
    startsAt: '2026-12-01',
    expectedGuests: 100,
    setting: 'indoor',
    budget: makeBudget({
      eventId: 'event-1',
      totalAvailable: rupees(10_000),
      categories: baseCategories(),
    }),
  });
}

function otherEvent() {
  return makeEvent({
    id: 'event-2',
    name: 'Other celebration',
    startsAt: '2026-11-20',
    expectedGuests: 20,
    budget: makeBudget({
      eventId: 'event-2',
      totalAvailable: rupees(1_000),
      categories: [],
    }),
  });
}

function workspaceWithBothEvents(): Workspace {
  return makeWorkspace({ events: [savedEvent(), otherEvent()] });
}

function requestFor(
  event: ReturnType<typeof savedEvent>,
): RescueRequest {
  return {
    eventId: event.id,
    current: requirementsFromEvent(event),
    changes: {},
    protectedCategoryIds: [],
    flexibleCategories: event.budget.categories.flatMap((category) =>
      category.flexibility.mode === 'flexible'
        ? [
            {
              categoryId: category.id,
              minimumPlanned: category.flexibility.minimumPlanned,
            },
          ]
        : [],
    ),
  };
}

function proposalFor(
  event: ReturnType<typeof savedEvent> = savedEvent(),
): RescueProposal {
  const result = analyzeEventRescue({
    event,
    tasks: [],
    request: requestFor(event),
    todayIso: TODAY,
    now: new Date('2026-10-24T09:00:00.000Z'),
  });

  if (!result.proposal) {
    throw new Error('Expected an engine proposal for the approval tests.');
  }

  return result.proposal;
}

interface PersistenceRecorder {
  readonly calls: Workspace[];
  persist(workspace: Workspace): { ok: true };
}

function recordingPersistence(): PersistenceRecorder {
  const calls: Workspace[] = [];

  return {
    calls,
    persist(workspace) {
      calls.push(workspace);
      return { ok: true };
    },
  };
}

function noDuplicates(): (proposalId: string) => boolean {
  return () => false;
}

describe('approveRescueProposal', () => {
  it('applies a validated proposal atomically, keeps other events isolated, and updates timestamps', () => {
    const workspace = workspaceWithBothEvents();
    const snapshot = JSON.parse(JSON.stringify(workspace)) as unknown;
    const proposal = proposalFor();
    const persistence = recordingPersistence();
    const outcome = approveRescueProposal(
      workspace,
      proposal,
      {
        persist: persistence.persist,
        isDuplicate: noDuplicates(),
      },
      { todayIso: TODAY, now: NOW },
    );

    expect(outcome.result.ok).toBe(true);

    if (!outcome.result.ok) {
      throw new Error(outcome.result.message);
    }

    expect(outcome.result.message).toMatch(/changes were applied to “wedding”/i);
    expect(outcome.result.message).toMatch(/passed the required validation/i);
    expect(outcome.result.message).not.toMatch(/rescued/i);
    expect(outcome.action?.type).toBe('rescue/applied');
    expect(persistence.calls).toHaveLength(1);
    expect(persistence.calls[0]).toBe(outcome.workspace);

    const updated = outcome.workspace.events.find(
      (event) => event.id === 'event-1',
    );
    const decor = updated?.budget.categories.find(
      (category) => category.id === 'decor',
    );
    const venue = updated?.budget.categories.find(
      (category) => category.id === 'venue',
    );

    expect(outcome.result.event).toEqual(updated);
    expect(decor?.planned).toEqual(rupees(2_000));
    expect(decor?.flexibility).toEqual({
      mode: 'flexible',
      minimumPlanned: rupees(2_000),
    });
    expect(venue?.planned).toEqual(rupees(6_000));
    expect(updated?.expectedGuests).toBe(100);
    expect(updated?.budget.totalAvailable).toEqual(rupees(10_000));
    expect(updated?.updatedAt).toBe(NOW_ISO);
    expect(updated?.budget.updatedAt).toBe(NOW_ISO);
    expect(updated?.budget.createdAt).toBe(proposal.originalEvent.budget.createdAt);

    const untouched = outcome.workspace.events.find(
      (event) => event.id === 'event-2',
    );
    expect(untouched).toEqual(otherEvent());

    // The input workspace and the proposal's original snapshot are never mutated.
    expect(workspace).toEqual(snapshot);
    expect(proposal.originalEvent).toEqual(savedEvent());
  });

  it('leaves the original event unchanged until approval is called', () => {
    const workspace = workspaceWithBothEvents();
    const proposal = proposalFor();

    expect(workspace.events[0]).toEqual(savedEvent());
    expect(proposal.originalEvent).toEqual(savedEvent());
    expect(proposal.proposedEvent).not.toEqual(savedEvent());
  });

  it('reports a persistence failure without partially applying the plan, then allows a safe retry', () => {
    const workspace = workspaceWithBothEvents();
    const proposal = proposalFor();
    let attempts = 0;
    const failed = approveRescueProposal(
      workspace,
      proposal,
      {
        persist: () => {
          attempts += 1;
          return { ok: false, message: 'Browser storage is unavailable.' };
        },
        isDuplicate: noDuplicates(),
      },
      { todayIso: TODAY, now: NOW },
    );

    expect(failed.result).toEqual({
      ok: false,
      code: 'persistence',
      message: 'Browser storage is unavailable.',
    });
    expect(failed.action).toBeNull();
    expect(failed.workspace).toBe(workspace);
    expect(workspace.events[0]).toEqual(savedEvent());
    expect(attempts).toBe(1);

    const persistence = recordingPersistence();
    const retried = approveRescueProposal(
      failed.workspace,
      proposal,
      {
        persist: persistence.persist,
        isDuplicate: noDuplicates(),
      },
      { todayIso: TODAY, now: NOW },
    );

    expect(retried.result.ok).toBe(true);
    expect(persistence.calls).toHaveLength(1);
    expect(
      retried.workspace.events[0]?.budget.categories.find(
        (category) => category.id === 'decor',
      )?.planned,
    ).toEqual(rupees(2_000));
  });

  it('rejects a stale proposal after the event changes and does not persist', () => {
    const workspace = workspaceWithBothEvents();
    const proposal = proposalFor();
    const changedWorkspace = workspaceReducer(workspace, {
      type: 'budget/total-updated',
      eventId: 'event-1',
      totalAvailable: rupees(12_000),
      updatedAt: '2026-10-24T11:00:00.000Z',
    });
    const persistence = recordingPersistence();
    const outcome = approveRescueProposal(
      changedWorkspace,
      proposal,
      {
        persist: persistence.persist,
        isDuplicate: noDuplicates(),
      },
      { todayIso: TODAY, now: NOW },
    );

    expect(outcome.result).toMatchObject({ ok: false, code: 'stale' });
    expect(outcome.result.ok ? '' : outcome.result.message).toMatch(
      /changed after this proposal was generated/i,
    );
    expect(persistence.calls).toHaveLength(0);
    expect(outcome.action).toBeNull();
    expect(outcome.workspace.events[0]?.budget.totalAvailable).toEqual(
      rupees(12_000),
    );
    expect(
      outcome.workspace.events[0]?.budget.categories.find(
        (category) => category.id === 'decor',
      )?.planned,
    ).toEqual(rupees(3_000));
  });

  it('prevents duplicate approval of the same proposal', () => {
    const workspace = workspaceWithBothEvents();
    const proposal = proposalFor();
    const applied = new Set<string>();
    const persistence = recordingPersistence();
    const dependencies = {
      persist: persistence.persist,
      isDuplicate: (proposalId: string) => applied.has(proposalId),
    };
    const first = approveRescueProposal(workspace, proposal, dependencies, {
      todayIso: TODAY,
      now: NOW,
    });

    expect(first.result.ok).toBe(true);
    applied.add(proposal.id);

    const second = approveRescueProposal(first.workspace, proposal, dependencies, {
      todayIso: TODAY,
      now: NOW,
    });

    expect(second.result).toMatchObject({ ok: false, code: 'duplicate' });
    expect(second.action).toBeNull();
    expect(second.workspace).toBe(first.workspace);
    expect(persistence.calls).toHaveLength(1);
    expect(
      second.workspace.events[0]?.budget.categories.find(
        (category) => category.id === 'decor',
      )?.planned,
    ).toEqual(rupees(2_000));
  });

  it('rejects a proposal with no changes', () => {
    const event = makeEvent({
      id: 'event-1',
      startsAt: '2026-12-01',
      expectedGuests: 100,
      budget: makeBudget({
        eventId: 'event-1',
        totalAvailable: rupees(12_000),
        categories: baseCategories(),
      }),
    });
    const proposal = proposalFor(event);
    const persistence = recordingPersistence();
    const outcome = approveRescueProposal(
      makeWorkspace({ events: [event] }),
      proposal,
      {
        persist: persistence.persist,
        isDuplicate: noDuplicates(),
      },
      { todayIso: TODAY, now: NOW },
    );

    expect(proposal.changes).toEqual([]);
    expect(outcome.result).toMatchObject({ ok: false, code: 'invalid' });
    expect(outcome.result.ok ? '' : outcome.result.message).toMatch(
      /no changes to apply/i,
    );
    expect(persistence.calls).toHaveLength(0);
  });

  it('re-validates and rejects a tampered proposal that reduces a protected category', () => {
    const workspace = workspaceWithBothEvents();
    const proposal = proposalFor();
    const tampered: RescueProposal = {
      ...proposal,
      proposedEvent: {
        ...proposal.proposedEvent,
        budget: {
          ...proposal.proposedEvent.budget,
          categories: proposal.proposedEvent.budget.categories.map((category) =>
            category.id === 'venue'
              ? { ...category, planned: rupees(5_000) }
              : category,
          ),
        },
      },
    };
    const persistence = recordingPersistence();
    const outcome = approveRescueProposal(
      workspace,
      tampered,
      {
        persist: persistence.persist,
        isDuplicate: noDuplicates(),
      },
      { todayIso: TODAY, now: NOW },
    );

    expect(outcome.result).toMatchObject({ ok: false, code: 'invalid' });
    expect(outcome.result.ok ? '' : outcome.result.message).toMatch(
      /cannot be reduced below its saved plan/i,
    );
    expect(persistence.calls).toHaveLength(0);
    expect(workspace.events[0]).toEqual(savedEvent());
  });

  it('rejects a proposal whose event no longer exists', () => {
    const workspace = makeWorkspace({ events: [otherEvent()] });
    const proposal = proposalFor();
    const persistence = recordingPersistence();
    const outcome = approveRescueProposal(
      workspace,
      proposal,
      {
        persist: persistence.persist,
        isDuplicate: noDuplicates(),
      },
      { todayIso: TODAY, now: NOW },
    );

    expect(outcome.result).toMatchObject({ ok: false, code: 'not-found' });
    expect(persistence.calls).toHaveLength(0);
    expect(outcome.workspace).toBe(workspace);
  });
});
