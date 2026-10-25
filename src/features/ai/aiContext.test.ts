import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import {
  makeActivity,
  makeBudget,
  makeCategory,
  makeCateringEstimate,
  makeEvent,
  makeGuest,
  makeRiskFinding,
  makeTask,
  makeWorkspace,
} from '@/test/fixtures';
import {
  buildAiEventContext,
  createAiContextSignature,
} from './aiContext';

function makeWorkspaceForContext(): Workspace {
  const event = makeEvent({
    id: 'event-1',
    name: 'Test Celebration',
    category: 'wedding',
    startsAt: '2030-12-01',
    venue: 'Test Venue',
    setting: 'indoor',
    theme: 'Garden lights',
    expectedGuests: 100,
    status: 'planning',
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
  const otherEvent = makeEvent({
    id: 'event-2',
    name: 'Other Celebration',
    budget: makeBudget({ eventId: 'event-2' }),
  });

  return makeWorkspace({
    events: [event, otherEvent],
    tasks: [
      makeTask({ id: 'task-1', eventId: 'event-1', title: 'Book the florist' }),
      makeTask({ id: 'task-2', eventId: 'event-2', title: 'Other event task' }),
    ],
    activities: [
      makeActivity({ id: 'activity-1', eventId: 'event-1', title: 'Ceremony' }),
      makeActivity({ id: 'activity-2', eventId: 'event-2', title: 'Other event activity' }),
    ],
    guests: [
      makeGuest({
        id: 'guest-1',
        eventId: 'event-1',
        name: 'Priya Sharma',
        email: 'priya@example.com',
        rsvp: 'confirmed',
        dietaryPreference: 'nut allergy',
        accessibilityRequest: 'wheelchair access',
        notes: 'Private note for the host only',
      }),
      makeGuest({
        id: 'guest-2',
        eventId: 'event-1',
        name: 'Ravi Kumar',
        rsvp: 'pending',
      }),
      makeGuest({
        id: 'guest-3',
        eventId: 'event-2',
        name: 'Other Guest',
        rsvp: 'confirmed',
      }),
    ],
    cateringEstimates: [
      makeCateringEstimate({
        eventId: 'event-1',
        perPersonCost: rupees(500),
        bufferPercent: 10,
      }),
    ],
    riskFindings: [
      makeRiskFinding({
        id: 'risk-open-event-1',
        eventId: 'event-1',
        title: 'Venue cost is close to its protected target',
      }),
      makeRiskFinding({
        id: 'risk-resolved-event-1',
        eventId: 'event-1',
        status: 'resolved',
        title: 'Resolved finding',
      }),
      makeRiskFinding({
        id: 'risk-open-event-2',
        eventId: 'event-2',
        title: 'Other event finding',
      }),
    ],
  });
}

describe('AI event context', () => {
  it('sends only the selected event, its aggregates, and open findings', () => {
    const workspace = makeWorkspaceForContext();
    const event = workspace.events[0]!;
    const result = buildAiEventContext(
      event,
      workspace,
      workspace.riskFindings ?? [],
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    const context = result.context;

    expect(context.id).toBe('event-1');
    expect(context.guestCounts).toEqual({
      invited: 2,
      confirmed: 1,
      pending: 1,
      declined: 0,
    });
    expect(context.dietaryRequirementCount).toBe(1);
    expect(context.accessibilityRequestCount).toBe(1);
    expect(context.tasks.map((task) => task.title)).toEqual(['Book the florist']);
    expect(context.activities.map((activity) => activity.title)).toEqual(['Ceremony']);
    expect(context.openRisks.map((finding) => finding.id)).toEqual([
      'risk-open-event-1',
    ]);
    expect(context.budget.totalAvailableMinor).toBe(10_000_000);
    expect(context.budget.categories.map((category) => category.name)).toEqual([
      'Venue',
      'Catering',
    ]);
    expect(context.accessibilityRequired).toBe(false);
  });

  it('never includes guest names, emails, notes, dietary, or accessibility text', () => {
    const workspace = makeWorkspaceForContext();
    const event = workspace.events[0]!;
    const result = buildAiEventContext(
      event,
      workspace,
      workspace.riskFindings ?? [],
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    const serialized = JSON.stringify(result.context);

    for (const privateValue of [
      'Priya Sharma',
      'priya@example.com',
      'nut allergy',
      'wheelchair access',
      'Private note for the host only',
      'Ravi Kumar',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it('uses the existing catering estimator with confirmed RSVPs', () => {
    const workspace = makeWorkspaceForContext();
    const event = workspace.events[0]!;
    const result = buildAiEventContext(
      event,
      workspace,
      workspace.riskFindings ?? [],
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.context.catering).toMatchObject({
      perPersonCostMinor: 50_000,
      bufferPercent: 10,
      baseAttendees: 1,
      estimatedAttendees: 2,
      estimatedCostMinor: 100_000,
      attendeeSource: 'confirmed',
      plannedCateringMinor: 2_000_000,
    });
  });

  it('changes the staleness signature for relevant data but not for private text', () => {
    const workspace = makeWorkspaceForContext();
    const event = workspace.events[0]!;
    const first = buildAiEventContext(
      event,
      workspace,
      workspace.riskFindings ?? [],
    );
    const repeated = buildAiEventContext(
      event,
      workspace,
      workspace.riskFindings ?? [],
    );

    expect(first.ok && repeated.ok).toBe(true);

    if (!first.ok || !repeated.ok) {
      return;
    }

    const signature = createAiContextSignature(first.context);
    expect(createAiContextSignature(repeated.context)).toBe(signature);

    const renamedGuest = workspace.guests.map((guest) =>
      guest.id === 'guest-1' ? { ...guest, name: 'Renamed Guest' } : guest,
    );
    const afterRename = buildAiEventContext(
      event,
      { ...workspace, guests: renamedGuest },
      workspace.riskFindings ?? [],
    );
    expect(afterRename.ok).toBe(true);

    if (afterRename.ok) {
      expect(createAiContextSignature(afterRename.context)).toBe(signature);
    }

    const changed = buildAiEventContext(
      event,
      {
        ...workspace,
        guests: [
          ...workspace.guests,
          makeGuest({ id: 'guest-4', eventId: 'event-1', rsvp: 'declined' }),
        ],
      },
      workspace.riskFindings ?? [],
    );
    expect(changed.ok).toBe(true);

    if (changed.ok) {
      expect(createAiContextSignature(changed.context)).not.toBe(signature);
    }

    const otherEventChanged = buildAiEventContext(
      event,
      {
        ...workspace,
        tasks: [
          ...workspace.tasks,
          makeTask({ id: 'task-3', eventId: 'event-2', title: 'Unrelated task' }),
        ],
      },
      workspace.riskFindings ?? [],
    );
    expect(otherEventChanged.ok).toBe(true);

    if (otherEventChanged.ok) {
      expect(createAiContextSignature(otherEventChanged.context)).toBe(signature);
    }
  });

  it('refuses to build a context from values that cannot be sent safely', () => {
    const workspace = makeWorkspaceForContext();
    const event = { ...workspace.events[0]!, name: 'x'.repeat(121) };
    const result = buildAiEventContext(
      event,
      workspace,
      workspace.riskFindings ?? [],
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.message).toContain('cannot be sent safely');
    }
  });
});
