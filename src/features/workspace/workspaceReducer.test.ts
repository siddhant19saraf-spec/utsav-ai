import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import {
  makeActivity,
  makeBudget,
  makeCateringEstimate,
  makeCategory,
  makeEvent,
  makeGuest,
  makeProposalSnapshot,
  makeRiskFinding,
  makeTask,
  makeWorkspace,
} from '@/test/fixtures';
import { workspaceReducer } from './workspaceReducer';

describe('workspaceReducer', () => {
  it('prepends a created event without touching existing data', () => {
    const existing = makeEvent({ id: 'existing' });
    const created = makeEvent({ id: 'created', name: 'New Celebration' });
    const workspace = makeWorkspace({ events: [existing] });

    const next = workspaceReducer(workspace, { type: 'event/created', event: created });

    expect(next.events.map((event) => event.id)).toEqual(['created', 'existing']);
    expect(next.tasks).toBe(workspace.tasks);
    expect(next.guests).toBe(workspace.guests);
    expect(workspace.events.map((event) => event.id)).toEqual(['existing']);
  });

  it('deletes one event and only its related planning records', () => {
    const alpha = makeEvent({ id: 'alpha', name: 'Alpha Wedding' });
    const beta = makeEvent({ id: 'beta', name: 'Beta Birthday' });
    const workspace = makeWorkspace({
      events: [alpha, beta],
      tasks: [
        makeTask({ id: 'alpha-task', eventId: 'alpha' }),
        makeTask({ id: 'beta-task', eventId: 'beta' }),
      ],
      guests: [
        makeGuest({ id: 'alpha-guest', eventId: 'alpha' }),
        makeGuest({ id: 'beta-guest', eventId: 'beta' }),
      ],
      activities: [
        makeActivity({ id: 'alpha-activity', eventId: 'alpha' }),
        makeActivity({ id: 'beta-activity', eventId: 'beta' }),
      ],
      cateringEstimates: [
        makeCateringEstimate({ eventId: 'alpha' }),
        makeCateringEstimate({ eventId: 'beta' }),
      ],
      riskFindings: [
        makeRiskFinding({ id: 'alpha-risk', eventId: 'alpha' }),
        makeRiskFinding({ id: 'beta-risk', eventId: 'beta' }),
      ],
      rescueProposalSnapshots: [
        makeProposalSnapshot({ proposalId: 'alpha-proposal', eventId: 'alpha' }),
        makeProposalSnapshot({ proposalId: 'beta-proposal', eventId: 'beta' }),
      ],
    });

    const next = workspaceReducer(workspace, {
      type: 'event/deleted',
      eventId: 'alpha',
    });

    expect(next.events.map((event) => event.id)).toEqual(['beta']);
    expect(next.tasks.map((task) => task.id)).toEqual(['beta-task']);
    expect(next.guests.map((guest) => guest.id)).toEqual(['beta-guest']);
    expect(next.activities.map((activity) => activity.id)).toEqual([
      'beta-activity',
    ]);
    expect(next.cateringEstimates.map((estimate) => estimate.eventId)).toEqual([
      'beta',
    ]);
    expect(next.riskFindings?.map((finding) => finding.id)).toEqual([
      'beta-risk',
    ]);
    expect(
      next.rescueProposalSnapshots?.map((snapshot) => snapshot.proposalId),
    ).toEqual(['beta-proposal']);
    expect(workspace.events).toHaveLength(2);
    expect(workspace.tasks).toHaveLength(2);
  });

  it('ignores deletion of an event that does not exist', () => {
    const workspace = makeWorkspace({
      events: [makeEvent({ id: 'existing' })],
    });

    expect(
      workspaceReducer(workspace, { type: 'event/deleted', eventId: 'missing' }),
    ).toBe(workspace);
  });

  it('toggles only the requested task and leaves the original workspace intact', () => {
    const first = makeTask({ id: 'first' });
    const second = makeTask({ id: 'second' });
    const workspace = makeWorkspace({ tasks: [first, second] });

    const next = workspaceReducer(workspace, {
      type: 'task/toggled',
      taskId: 'second',
      status: 'completed',
      updatedAt: '2026-10-24T10:00:00.000Z',
    });

    expect(next.tasks).toEqual([
      first,
      { ...second, status: 'completed', updatedAt: '2026-10-24T10:00:00.000Z' },
    ]);
    expect(workspace.tasks).toEqual([first, second]);
  });

  it('toggles a completed task back to open', () => {
    const done = makeTask({ id: 'done', status: 'completed' });
    const workspace = makeWorkspace({ tasks: [done] });

    const next = workspaceReducer(workspace, {
      type: 'task/toggled',
      taskId: 'done',
      status: 'open',
      updatedAt: '2026-10-24T10:00:00.000Z',
    });

    expect(next.tasks[0]).toEqual({
      ...done,
      status: 'open',
      updatedAt: '2026-10-24T10:00:00.000Z',
    });
  });

  it('merges demo data into an empty workspace', () => {
    const seed = makeWorkspace({
      events: [makeEvent({ id: 'seed-event', origin: 'sample' })],
      tasks: [makeTask({ id: 'seed-task', eventId: 'seed-event' })],
      guests: [makeGuest({ id: 'seed-guest', eventId: 'seed-event' })],
    });

    const next = workspaceReducer(makeWorkspace(), { type: 'demo/loaded', seed });

    expect(next).toEqual(seed);
  });

  it('appends demo data when only user-created data is present', () => {
    const userEvent = makeEvent({ id: 'user-event', origin: 'user' });
    const workspace = makeWorkspace({ events: [userEvent] });
    const seed = makeWorkspace({
      events: [makeEvent({ id: 'seed-event', origin: 'sample' })],
      tasks: [makeTask({ id: 'seed-task', eventId: 'seed-event' })],
      guests: [],
    });

    const next = workspaceReducer(workspace, { type: 'demo/loaded', seed });

    expect(next.events.map((event) => event.id)).toEqual(['user-event', 'seed-event']);
    expect(next.tasks.map((task) => task.id)).toEqual(['seed-task']);
  });

  it('does not duplicate sample data that is already loaded', () => {
    const workspace = makeWorkspace({
      events: [makeEvent({ id: 'seed-event', origin: 'sample' })],
    });
    const seed = makeWorkspace({
      events: [makeEvent({ id: 'another-seed', origin: 'sample' })],
    });

    expect(workspaceReducer(workspace, { type: 'demo/loaded', seed })).toBe(workspace);
  });

  it('removes sample events and their tasks and guests while keeping user data', () => {
    const userEvent = makeEvent({ id: 'user-event', origin: 'user' });
    const sampleEvent = makeEvent({ id: 'sample-event', origin: 'sample' });
    const workspace = makeWorkspace({
      events: [userEvent, sampleEvent],
      tasks: [
        makeTask({ id: 'user-task', eventId: 'user-event' }),
        makeTask({ id: 'sample-task', eventId: 'sample-event' }),
      ],
      guests: [
        makeGuest({ id: 'user-guest', eventId: 'user-event' }),
        makeGuest({ id: 'sample-guest', eventId: 'sample-event' }),
      ],
    });

    const next = workspaceReducer(workspace, { type: 'demo/removed' });

    expect(next.events).toEqual([userEvent]);
    expect(next.tasks.map((task) => task.id)).toEqual(['user-task']);
    expect(next.guests.map((guest) => guest.id)).toEqual(['user-guest']);
  });

  it('is safe to run demo removal twice', () => {
    const workspace = makeWorkspace({
      events: [makeEvent({ id: 'user-event', origin: 'user' })],
    });

    expect(workspaceReducer(workspace, { type: 'demo/removed' })).toEqual(workspace);
  });
});

describe('workspaceReducer event updates', () => {
  it('replaces only the matching event and leaves related records untouched', () => {
    const first = makeEvent({ id: 'first', name: 'First Celebration' });
    const second = makeEvent({ id: 'second', name: 'Second Celebration' });
    const workspace = makeWorkspace({
      events: [first, second],
      tasks: [makeTask({ id: 'first-task', eventId: 'first' })],
    });
    const updated = { ...first, name: 'First Celebration Updated' };

    const next = workspaceReducer(workspace, {
      type: 'event/updated',
      event: updated,
    });

    expect(next.events).toEqual([updated, second]);
    expect(next.events[1]).toBe(second);
    expect(next.tasks).toBe(workspace.tasks);
    expect(workspace.events[0]).toBe(first);
  });

  it('ignores an unknown event or a budget owned by another event', () => {
    const event = makeEvent({
      id: 'first',
      budget: makeBudget({ id: 'budget-first', eventId: 'first' }),
    });
    const workspace = makeWorkspace({ events: [event] });

    expect(
      workspaceReducer(workspace, {
        type: 'event/updated',
        event: makeEvent({ id: 'missing' }),
      }),
    ).toBe(workspace);

    expect(
      workspaceReducer(workspace, {
        type: 'event/updated',
        event: {
          ...event,
          budget: makeBudget({ id: 'budget-other', eventId: 'other' }),
        },
      }),
    ).toBe(workspace);
  });
});

describe('workspaceReducer budget isolation', () => {
  function createTwoEventWorkspace() {
    const wedding = makeEvent({
      id: 'wedding',
      budget: makeBudget({
        eventId: 'wedding',
        totalAvailable: rupees(10_000),
        categories: [makeCategory({ id: 'venue', planned: rupees(6_000) })],
      }),
    });
    const birthday = makeEvent({
      id: 'birthday',
      budget: makeBudget({
        eventId: 'birthday',
        totalAvailable: rupees(3_000),
        categories: [makeCategory({ id: 'cake', name: 'Cake', planned: rupees(500) })],
      }),
    });

    return makeWorkspace({ events: [wedding, birthday] });
  }

  it('updates only the target event total', () => {
    const workspace = createTwoEventWorkspace();
    const untouchedBudget = workspace.events[1]?.budget;

    const next = workspaceReducer(workspace, {
      type: 'budget/total-updated',
      eventId: 'wedding',
      totalAvailable: rupees(12_000),
      updatedAt: '2026-10-25T00:00:00.000Z',
    });

    expect(next.events[0]?.budget.totalAvailable).toEqual(rupees(12_000));
    expect(next.events[0]?.budget.updatedAt).toBe('2026-10-25T00:00:00.000Z');
    expect(next.events[1]?.budget).toBe(untouchedBudget);
    expect(workspace.events[0]?.budget.totalAvailable).toEqual(rupees(10_000));
  });

  it('upserts and removes categories only for the target event', () => {
    const workspace = createTwoEventWorkspace();
    const catering = makeCategory({ id: 'catering', name: 'Catering', planned: rupees(1_000) });

    const added = workspaceReducer(workspace, {
      type: 'budget/category-upserted',
      eventId: 'wedding',
      category: catering,
      updatedAt: '2026-10-25T00:00:00.000Z',
    });

    expect(added.events[0]?.budget.categories.map((category) => category.id)).toEqual([
      'venue',
      'catering',
    ]);
    expect(added.events[1]?.budget.categories.map((category) => category.id)).toEqual(['cake']);

    const removed = workspaceReducer(added, {
      type: 'budget/category-removed',
      eventId: 'wedding',
      categoryId: 'venue',
      updatedAt: '2026-10-25T00:00:00.000Z',
    });

    expect(removed.events[0]?.budget.categories).toEqual([catering]);
    expect(removed.events[1]?.budget.categories.map((category) => category.id)).toEqual(['cake']);
  });

  it('applies an approved repair list only to the target event', () => {
    const workspace = createTwoEventWorkspace();
    const repaired = [
      makeCategory({
        id: 'venue',
        planned: rupees(4_000),
        flexibility: { mode: 'flexible', minimumPlanned: rupees(4_000) },
      }),
    ];

    const next = workspaceReducer(workspace, {
      type: 'budget/categories-replaced',
      eventId: 'wedding',
      categories: repaired,
      updatedAt: '2026-10-25T00:00:00.000Z',
    });

    expect(next.events[0]?.budget.categories).toEqual(repaired);
    expect(next.events[1]?.budget.categories.map((category) => category.id)).toEqual(['cake']);
    expect(workspace.events[0]?.budget.categories[0]?.planned).toEqual(rupees(6_000));
  });

  it('updates only the target event emergency reserve', () => {
    const workspace = createTwoEventWorkspace();

    const next = workspaceReducer(workspace, {
      type: 'budget/reserve-updated',
      eventId: 'birthday',
      reserve: { enabled: true, target: rupees(200) },
      updatedAt: '2026-10-25T00:00:00.000Z',
    });

    expect(next.events[1]?.budget.emergencyReserve).toEqual({
      enabled: true,
      target: rupees(200),
    });
    expect(next.events[1]?.budget.categories.map((category) => category.id)).toEqual([
      'cake',
      'emergency-reserve',
    ]);
    expect(next.events[0]?.budget.emergencyReserve).toEqual({
      enabled: false,
      target: rupees(0),
    });
  });

  it('returns the same workspace when the event does not exist', () => {
    const workspace = createTwoEventWorkspace();

    expect(
      workspaceReducer(workspace, {
        type: 'budget/total-updated',
        eventId: 'missing',
        totalAvailable: rupees(1),
        updatedAt: '2026-10-25T00:00:00.000Z',
      }),
    ).toBe(workspace);
  });
});
