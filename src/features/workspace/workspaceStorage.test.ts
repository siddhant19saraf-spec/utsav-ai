import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
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
import {
  WORKSPACE_RECOVERY_KEY,
  WORKSPACE_STORAGE_KEY,
  exportWorkspaceToJson,
  importWorkspaceFromJson,
  loadWorkspaceFromStorage,
  parseStoredWorkspace,
  saveWorkspaceToStorage,
} from './workspaceStorage';

interface FakeStorage {
  readonly values: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function createStorage(initial?: Record<string, string>): FakeStorage {
  const values = new Map(Object.entries(initial ?? {}));

  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function validWorkspace(): Workspace {
  return makeWorkspace({
    events: [
      makeEvent({
        id: 'wedding',
        budget: makeBudget({
          eventId: 'wedding',
          totalAvailable: rupees(10_000),
          categories: [
            makeCategory({
              id: 'venue',
              planned: rupees(6_000),
              actual: rupees(1_000),
            }),
          ],
        }),
      }),
    ],
    tasks: [makeTask({ id: 'task-wedding', eventId: 'wedding' })],
    guests: [makeGuest({ id: 'guest-wedding', eventId: 'wedding' })],
  });
}

function storedValue(value: unknown): string {
  return JSON.stringify(value);
}

describe('saveWorkspaceToStorage and loadWorkspaceFromStorage', () => {
  it('round-trips a complete workspace through storage', () => {
    const storage = createStorage();
    const workspace = validWorkspace();

    const saved = saveWorkspaceToStorage(workspace, storage);

    expect(saved).toEqual({ ok: true });
    expect(storage.values.has(WORKSPACE_STORAGE_KEY)).toBe(true);

    const loaded = loadWorkspaceFromStorage(storage);

    expect(loaded).toEqual({ status: 'loaded', workspace });
  });

  it('preserves a budget overrun as a warning rather than rejecting the save', () => {
    const storage = createStorage();
    const workspace = makeWorkspace({
      events: [
        makeEvent({
          id: 'over-budget',
          budget: makeBudget({
            eventId: 'over-budget',
            totalAvailable: rupees(1_000),
            categories: [
              makeCategory({
                id: 'venue',
                planned: rupees(1_500),
                flexibility: {
                  mode: 'flexible',
                  minimumPlanned: rupees(500),
                },
              }),
            ],
          }),
        }),
      ],
    });

    expect(saveWorkspaceToStorage(workspace, storage)).toEqual({ ok: true });

    const loaded = loadWorkspaceFromStorage(storage);
    expect(loaded.status).toBe('loaded');

    if (loaded.status === 'loaded') {
      expect(loaded.workspace).toEqual(workspace);
    }
  });

  it('round-trips activities, detailed guests, and catering assumptions per event', () => {
    const storage = createStorage();
    const wedding = makeEvent({
      id: 'wedding',
      budget: makeBudget({ eventId: 'wedding' }),
    });
    const birthday = makeEvent({
      id: 'birthday',
      budget: makeBudget({ eventId: 'birthday' }),
    });
    const workspace = makeWorkspace({
      events: [wedding, birthday],
      tasks: [
        makeTask({ id: 'task-wedding', eventId: 'wedding' }),
        makeTask({ id: 'task-birthday', eventId: 'birthday' }),
      ],
      guests: [
        makeGuest({
          id: 'guest-wedding',
          eventId: 'wedding',
          rsvp: 'confirmed',
          dietaryPreference: 'Vegetarian',
          accessibilityRequest: 'Step-free access',
          notes: 'Arriving early',
        }),
        makeGuest({ id: 'guest-birthday', eventId: 'birthday', rsvp: 'pending' }),
      ],
      activities: [
        makeActivity({ id: 'activity-wedding', eventId: 'wedding' }),
        makeActivity({ id: 'activity-birthday', eventId: 'birthday' }),
      ],
      cateringEstimates: [
        makeCateringEstimate({ eventId: 'wedding', bufferPercent: 10 }),
        makeCateringEstimate({ eventId: 'birthday', bufferPercent: 0 }),
      ],
    });

    expect(saveWorkspaceToStorage(workspace, storage)).toEqual({ ok: true });
    expect(loadWorkspaceFromStorage(storage)).toEqual({
      status: 'loaded',
      workspace,
    });
  });

  it('reports an empty storage slot without inventing a workspace', () => {
    expect(loadWorkspaceFromStorage(createStorage())).toEqual({ status: 'empty' });
  });

  it('reports unavailable storage instead of throwing', () => {
    expect(loadWorkspaceFromStorage(null)).toMatchObject({ status: 'unavailable' });
    expect(saveWorkspaceToStorage(validWorkspace(), null)).toMatchObject({ ok: false });
  });

  it('reports storage access failures', () => {
    const unavailable = {
      getItem(): string | null {
        throw new Error('SecurityError');
      },
      setItem(): void {
        throw new Error('QuotaExceededError');
      },
    };

    expect(loadWorkspaceFromStorage(unavailable)).toMatchObject({
      status: 'unavailable',
    });
    expect(saveWorkspaceToStorage(validWorkspace(), unavailable)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/could not be saved/i),
    });
  });

  it('does not overwrite malformed saved data with an invented result', () => {
    const storage = createStorage({ [WORKSPACE_STORAGE_KEY]: '{not json' });
    const loaded = loadWorkspaceFromStorage(storage);

    expect(loaded).toMatchObject({ status: 'invalid' });

    if (loaded.status === 'invalid') {
      expect(loaded.message).toMatch(/not valid JSON/i);
    }

    expect(storage.values.get(WORKSPACE_STORAGE_KEY)).toBe('{not json');
    expect(storage.values.has(WORKSPACE_RECOVERY_KEY)).toBe(true);
  });

  it('saves the current schema version', () => {
    const storage = createStorage();

    saveWorkspaceToStorage(validWorkspace(), storage);

    const stored = JSON.parse(storage.values.get(WORKSPACE_STORAGE_KEY) ?? '{}') as {
      version?: number;
    };
    expect(stored.version).toBe(2);
  });

  it('loads a version 1 save through the current schema', () => {
    const workspace = validWorkspace();
    const storage = createStorage({
      [WORKSPACE_STORAGE_KEY]: storedValue({ version: 1, workspace }),
    });

    expect(loadWorkspaceFromStorage(storage)).toEqual({
      status: 'loaded',
      workspace,
    });
  });

  it('round-trips finding statuses and proposal snapshots', () => {
    const storage = createStorage();
    const workspace = makeWorkspace({
      events: [makeEvent({ id: 'event-1' })],
      riskFindings: [
        makeRiskFinding({ id: 'risk-open' }),
        makeRiskFinding({
          id: 'risk-dismissed',
          status: 'dismissed',
          dismissedAt: '2026-10-25T09:00:00.000Z',
          statusChangedAt: '2026-10-25T09:00:00.000Z',
        }),
      ],
      rescueProposalSnapshots: [makeProposalSnapshot()],
    });

    expect(saveWorkspaceToStorage(workspace, storage)).toEqual({ ok: true });
    expect(loadWorkspaceFromStorage(storage)).toEqual({
      status: 'loaded',
      workspace,
    });
  });

  it('salvages readable records when one saved event is invalid', () => {
    const storage = createStorage();
    const readableEvent = makeEvent({
      id: 'readable',
      name: 'Readable Celebration',
      budget: makeBudget({ eventId: 'readable' }),
    });
    const invalidEvent = makeEvent({
      id: 'invalid',
      name: 'Invalid Celebration',
      budget: makeBudget({ eventId: 'invalid' }),
    });
    const workspace = makeWorkspace({
      events: [readableEvent, invalidEvent],
      tasks: [
        makeTask({ id: 'task-readable', eventId: 'readable', title: 'Readable task' }),
        makeTask({ id: 'task-invalid', eventId: 'invalid', title: 'Invalid task' }),
      ],
      guests: [
        makeGuest({ id: 'guest-readable', eventId: 'readable', name: 'Readable Guest' }),
        makeGuest({ id: 'guest-invalid', eventId: 'invalid', name: 'Invalid Guest' }),
      ],
      activities: [
        makeActivity({ id: 'activity-readable', eventId: 'readable' }),
        makeActivity({ id: 'activity-invalid', eventId: 'invalid' }),
      ],
      cateringEstimates: [
        makeCateringEstimate({ eventId: 'readable' }),
        makeCateringEstimate({ eventId: 'invalid' }),
      ],
      riskFindings: [
        makeRiskFinding({ id: 'risk-readable', eventId: 'readable' }),
        makeRiskFinding({ id: 'risk-invalid', eventId: 'invalid' }),
      ],
      rescueProposalSnapshots: [
        makeProposalSnapshot({ eventId: 'readable' }),
        makeProposalSnapshot({ eventId: 'invalid' }),
      ],
    });
    const raw = storedValue({ version: 2, workspace });
    const corrupted = JSON.parse(raw) as {
      workspace: { events: { budget: { totalAvailable: unknown } }[] };
    };

    if (corrupted.workspace.events[1]) {
      corrupted.workspace.events[1].budget.totalAvailable = {
        amountMinor: -1,
        currency: 'INR',
      };
    }

    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(corrupted));
    const loaded = loadWorkspaceFromStorage(storage);

    expect(loaded.status).toBe('partial');

    if (loaded.status !== 'partial') {
      return;
    }

    expect(loaded.workspace.events).toEqual([readableEvent]);
    expect(loaded.workspace.tasks).toEqual([workspace.tasks[0]]);
    expect(loaded.workspace.guests).toEqual([workspace.guests[0]]);
    expect(loaded.workspace.activities).toEqual([workspace.activities[0]]);
    expect(loaded.workspace.cateringEstimates).toEqual([
      workspace.cateringEstimates[0],
    ]);
    expect(loaded.workspace.riskFindings).toEqual([workspace.riskFindings?.[0]]);
    expect(loaded.workspace.rescueProposalSnapshots).toEqual([
      workspace.rescueProposalSnapshots?.[0],
    ]);
    expect(loaded.issues.join(' ')).toMatch(/event record could not be read/i);
    expect(loaded.issues.join(' ')).toMatch(/missing event/i);
    expect(loaded.message).not.toMatch(/Readable Celebration|Readable Guest|Readable task/);
    expect(loaded.recovery).toBe('saved');
    expect(storage.values.get(WORKSPACE_STORAGE_KEY)).toBe(
      JSON.stringify(corrupted),
    );
    expect(storage.values.get(WORKSPACE_RECOVERY_KEY)).toContain(
      'Readable Celebration',
    );
  });

  it('preserves a dismissed finding when another finding record is malformed', () => {
    const storage = createStorage();
    const dismissed = makeRiskFinding({
      id: 'risk-dismissed',
      status: 'dismissed',
      dismissedAt: '2026-10-25T09:00:00.000Z',
      statusChangedAt: '2026-10-25T09:00:00.000Z',
    });
    const workspace = makeWorkspace({
      events: [makeEvent({ id: 'event-1' })],
      riskFindings: [
        dismissed,
        makeRiskFinding({ id: 'risk-malformed', severity: 'high' }),
      ],
    });

    saveWorkspaceToStorage(workspace, storage);
    const stored = JSON.parse(
      storage.values.get(WORKSPACE_STORAGE_KEY) ?? '{}',
    ) as {
      workspace: { riskFindings: { severity: string }[] };
    };

    if (stored.workspace.riskFindings[1]) {
      stored.workspace.riskFindings[1].severity = 'urgent';
    }

    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(stored));
    const loaded = loadWorkspaceFromStorage(storage);

    expect(loaded.status).toBe('partial');

    if (loaded.status === 'partial') {
      expect(loaded.workspace.riskFindings).toEqual([dismissed]);
      expect(loaded.workspace.riskFindings?.[0]?.status).toBe('dismissed');
      expect(loaded.workspace.riskFindings?.[0]?.dismissedAt).toBe(
        '2026-10-25T09:00:00.000Z',
      );
    }
  });

  it('keeps the first recovery copy instead of overwriting it', () => {
    const storage = createStorage({
      [WORKSPACE_STORAGE_KEY]: '{first corrupt payload',
    });

    const first = loadWorkspaceFromStorage(storage);
    const firstRecovery = storage.values.get(WORKSPACE_RECOVERY_KEY);

    expect(first).toMatchObject({ status: 'invalid', recovery: 'saved' });
    expect(firstRecovery).toBeDefined();

    storage.setItem(WORKSPACE_STORAGE_KEY, '{second corrupt payload');
    const second = loadWorkspaceFromStorage(storage);

    expect(second).toMatchObject({ status: 'invalid', recovery: 'existing' });
    expect(storage.values.get(WORKSPACE_RECOVERY_KEY)).toBe(firstRecovery);
    expect(storage.values.get(WORKSPACE_STORAGE_KEY)).toBe(
      '{second corrupt payload',
    );
  });

  it('reports a clear quota failure without losing the workspace', () => {
    const quotaStorage = {
      getItem(): string | null {
        return null;
      },
      setItem(): void {
        const error = new Error('You ran out of space');
        error.name = 'QuotaExceededError';
        throw error;
      },
    };
    const result = saveWorkspaceToStorage(validWorkspace(), quotaStorage);

    expect(result).toMatchObject({ ok: false, code: 'quota' });

    if (!result.ok) {
      expect(result.message).toMatch(/local storage is full/i);
      expect(result.message).toMatch(/export a backup/i);
    }
  });

  it('does not expose record names in invalid save messages', () => {
    const storage = createStorage({
      [WORKSPACE_STORAGE_KEY]: storedValue({
        version: 2,
        workspace: makeWorkspace({
          events: [
            makeEvent({
              id: 'wedding',
              name: 'Meera and Kabir Wedding',
            }),
          ],
        }),
      }),
    });
    const loaded = loadWorkspaceFromStorage(storage);

    expect(loaded.status).toBe('loaded');

    const invalidStorage = createStorage({
      [WORKSPACE_STORAGE_KEY]: storedValue({
        version: 2,
        workspace: {
          events: [
            makeEvent({ id: 'wedding', name: 'Meera and Kabir Wedding' }),
          ],
          tasks: [{ id: 'bad-task', title: 'Meera and Kabir Wedding' }],
          guests: [],
        },
      }),
    });
    const invalid = loadWorkspaceFromStorage(invalidStorage);

    expect(invalid.status).toBe('partial');

    if (invalid.status === 'partial') {
      expect(invalid.message).not.toMatch(/Meera and Kabir/);
      expect(invalid.workspace.events[0]?.name).toBe('Meera and Kabir Wedding');
    }
  });
});

describe('exportWorkspaceToJson and importWorkspaceFromJson', () => {
  it('round-trips a valid workspace with risk history through JSON', () => {
    const workspace = makeWorkspace({
      events: [makeEvent({ id: 'event-1' })],
      tasks: [makeTask({ id: 'task-1', eventId: 'event-1' })],
      riskFindings: [
        makeRiskFinding({
          id: 'risk-dismissed',
          status: 'dismissed',
          dismissedAt: '2026-10-25T09:00:00.000Z',
          statusChangedAt: '2026-10-25T09:00:00.000Z',
        }),
      ],
      rescueProposalSnapshots: [makeProposalSnapshot()],
    });
    const exported = exportWorkspaceToJson(workspace);

    expect(exported.ok).toBe(true);

    if (!exported.ok) {
      return;
    }

    const envelope = JSON.parse(exported.json) as {
      version: number;
      exportedAt: string;
      workspace: Workspace;
    };
    expect(envelope.version).toBe(2);
    expect(envelope.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(importWorkspaceFromJson(exported.json)).toEqual({
      ok: true,
      workspace,
    });
  });

  it('rejects the whole import when one record is invalid', () => {
    const workspace = makeWorkspace({
      events: [makeEvent({ id: 'event-1' }), makeEvent({ id: 'event-2' })],
      tasks: [makeTask({ id: 'task-1', eventId: 'event-1' })],
    });
    const exported = exportWorkspaceToJson(workspace);

    expect(exported.ok).toBe(true);

    if (!exported.ok) {
      return;
    }

    const corrupted = JSON.parse(exported.json) as {
      workspace: { events: { name: unknown }[] };
    };

    if (corrupted.workspace.events[1]) {
      corrupted.workspace.events[1].name = 42;
    }

    const imported = importWorkspaceFromJson(JSON.stringify(corrupted));

    expect(imported.ok).toBe(false);

    if (!imported.ok) {
      expect(imported.message).toMatch(/could not be imported/i);
      expect(imported.message).toMatch(/nothing was changed/i);
    }
  });

  it('rejects unsupported versions, invalid JSON, and empty files', () => {
    expect(importWorkspaceFromJson('')).toMatchObject({ ok: false });
    expect(importWorkspaceFromJson('{not json')).toMatchObject({ ok: false });
    expect(
      importWorkspaceFromJson(
        storedValue({ version: 3, workspace: validWorkspace() }),
      ),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/version is not supported/i),
    });
  });

  it('refuses to export a workspace that would not import', () => {
    const broken = makeWorkspace({
      tasks: [makeTask({ id: 'orphan', eventId: 'missing' })],
    });

    expect(exportWorkspaceToJson(broken)).toMatchObject({ ok: false });
  });
});

describe('parseStoredWorkspace', () => {
  it('rejects unsupported versions', () => {
    const result = parseStoredWorkspace(
      storedValue({ version: 3, workspace: validWorkspace() }),
    );

    expect(result).toEqual({
      ok: false,
      message: 'The saved workspace version is not supported.',
    });
  });

  it('accepts both the current and previous schema versions', () => {
    const workspace = validWorkspace();

    expect(parseStoredWorkspace(storedValue({ version: 1, workspace }))).toEqual({
      ok: true,
      workspace,
    });
    expect(parseStoredWorkspace(storedValue({ version: 2, workspace }))).toEqual({
      ok: true,
      workspace,
    });
  });

  it('rejects missing top-level collections', () => {
    const result = parseStoredWorkspace(
      storedValue({ version: 1, workspace: { events: [] } }),
    );

    expect(result.ok).toBe(false);
  });

  it('rejects duplicate event identifiers', () => {
    const event = makeEvent({ id: 'duplicate' });
    const result = parseStoredWorkspace(
      storedValue({
        version: 1,
        workspace: makeWorkspace({ events: [event, event] }),
      }),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.message).toMatch(/duplicate identifier/i);
    }
  });

  it('rejects a budget whose event identifier does not match its event', () => {
    const event = makeEvent({
      id: 'wedding',
      budget: makeBudget({ eventId: 'another-event' }),
    });
    const result = parseStoredWorkspace(
      storedValue({
        version: 1,
        workspace: makeWorkspace({ events: [event] }),
      }),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.message).toMatch(/does not match its event/i);
    }
  });

  it('rejects duplicate budget category identifiers', () => {
    const category = makeCategory({ id: 'venue' });
    const event = makeEvent({
      id: 'wedding',
      budget: makeBudget({
        eventId: 'wedding',
        categories: [category, category],
      }),
    });
    const result = parseStoredWorkspace(
      storedValue({
        version: 1,
        workspace: makeWorkspace({ events: [event] }),
      }),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.message).toMatch(/duplicate-category-id/i);
    }
  });

  it('round-trips the optional planning fields used by Event Rescue', () => {
    const event = makeEvent({
      id: 'rescue-event',
      startsAt: '2026-12-01',
      setting: 'outdoor',
      theme: 'Courtyard celebration',
      accessibilityRequired: true,
      accessibilityAddressed: false,
      contingencyPlanConfirmed: false,
      updatedAt: '2026-10-24T10:00:00.000Z',
      budget: makeBudget({
        eventId: 'rescue-event',
        totalAvailable: rupees(10_000),
        categories: [makeCategory({ id: 'venue', planned: rupees(6_000) })],
      }),
    });
    const workspace = makeWorkspace({
      events: [event],
      tasks: [],
      guests: [],
    });
    const result = parseStoredWorkspace(
      storedValue({ version: 1, workspace }),
    );

    expect(result).toEqual({ ok: true, workspace });
    expect(result.ok ? result.workspace.events[0] : null).toMatchObject({
      setting: 'outdoor',
      theme: 'Courtyard celebration',
      accessibilityRequired: true,
      accessibilityAddressed: false,
      contingencyPlanConfirmed: false,
      updatedAt: '2026-10-24T10:00:00.000Z',
    });
  });

  it('rejects an unrecognised event setting instead of guessing', () => {
    const event = JSON.parse(
      storedValue({
        version: 1,
        workspace: makeWorkspace({ events: [makeEvent({ id: 'wedding' })] }),
      }),
    ) as {
      workspace: { events: { setting?: string }[] };
    };

    if (event.workspace.events[0]) {
      event.workspace.events[0].setting = 'beachside';
    }

    const result = parseStoredWorkspace(JSON.stringify(event));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.message).toMatch(/setting is not recognised/i);
    }
  });

  it('rejects malformed money and protection data', () => {
    const event = makeEvent({ id: 'wedding' });
    const malformed = JSON.parse(
      storedValue({
        version: 1,
        workspace: makeWorkspace({ events: [event] }),
      }),
    ) as {
      workspace: {
        events: {
          budget: {
            categories: unknown[];
            totalAvailable: unknown;
          };
        }[];
      };
    };
    const storedEvent = malformed.workspace.events[0];

    if (storedEvent) {
      storedEvent.budget.totalAvailable = { amountMinor: -1, currency: 'INR' };
      storedEvent.budget.categories = [
        {
          id: 'venue',
          name: 'Venue',
          planned: { amountMinor: 1.5, currency: 'INR' },
          actual: { amountMinor: 0, currency: 'INR' },
          flexibility: { mode: 'semi-protected' },
        },
      ];
    }

    const result = parseStoredWorkspace(JSON.stringify(malformed));

    expect(result.ok).toBe(false);
  });

  it('rejects tasks that refer to a missing event', () => {
    const result = parseStoredWorkspace(
      storedValue({
        version: 1,
        workspace: makeWorkspace({
          events: [makeEvent({ id: 'wedding' })],
          tasks: [makeTask({ id: 'orphan', eventId: 'missing' })],
        }),
      }),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.message).toMatch(/does not exist/i);
    }
  });

  it('migrates legacy task completion and RSVP fields from earlier saves', () => {
    const legacy = {
      version: 1,
      workspace: {
        events: [makeEvent({ id: 'wedding' })],
        tasks: [
          {
            id: 'task-open',
            eventId: 'wedding',
            title: 'Open legacy task',
            dueDate: '2026-11-15',
            priority: 'medium',
            completed: false,
          },
          {
            id: 'task-done',
            eventId: 'wedding',
            title: 'Done legacy task',
            dueDate: '2026-11-16',
            priority: 'low',
            completed: true,
          },
        ],
        guests: [
          {
            id: 'guest-attending',
            eventId: 'wedding',
            name: 'Meera',
            rsvp: 'attending',
            dietaryNotes: 'Jain',
          },
          {
            id: 'guest-waitlisted',
            eventId: 'wedding',
            name: 'Kabir',
            rsvp: 'waitlisted',
          },
        ],
      },
    };

    const result = parseStoredWorkspace(storedValue(legacy));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.workspace.tasks[0]).toMatchObject({
        id: 'task-open',
        status: 'open',
      });
      expect(result.workspace.tasks[1]).toMatchObject({
        id: 'task-done',
        status: 'completed',
      });
      expect(result.workspace.guests[0]).toMatchObject({
        id: 'guest-attending',
        rsvp: 'confirmed',
        dietaryPreference: 'Jain',
      });
      expect(result.workspace.guests[1]).toMatchObject({
        id: 'guest-waitlisted',
        rsvp: 'pending',
      });
      expect(result.workspace.activities).toEqual([]);
      expect(result.workspace.cateringEstimates).toEqual([]);
    }
  });

  it('defaults missing activity and catering collections to empty arrays', () => {
    const workspace = makeWorkspace({ events: [makeEvent({ id: 'wedding' })] });
    const stored = JSON.parse(
      storedValue({ version: 1, workspace }),
    ) as { workspace: Record<string, unknown> };

    delete stored.workspace.activities;
    delete stored.workspace.cateringEstimates;

    expect(parseStoredWorkspace(JSON.stringify(stored))).toEqual({
      ok: true,
      workspace,
    });
  });

  it('rejects activity times that are invalid or not strictly ordered', () => {
    const workspaceFor = (startsAt: string, endsAt: string) =>
      makeWorkspace({
        events: [makeEvent({ id: 'wedding' })],
        activities: [
          makeActivity({
            id: 'ceremony',
            eventId: 'wedding',
            startsAt,
            endsAt,
          }),
        ],
      });

    const malformed = parseStoredWorkspace(
      storedValue({
        version: 1,
        workspace: workspaceFor('2026-11-30 10:00', '2026-11-30T11:00'),
      }),
    );
    expect(malformed.ok).toBe(false);

    if (!malformed.ok) {
      expect(malformed.message).toMatch(/local date-time format/i);
    }

    const reversed = parseStoredWorkspace(
      storedValue({
        version: 1,
        workspace: workspaceFor('2026-11-30T12:00', '2026-11-30T12:00'),
      }),
    );
    expect(reversed.ok).toBe(false);

    if (!reversed.ok) {
      expect(reversed.message).toMatch(/end time must be after its start time/i);
    }
  });

  it('rejects duplicate activity identifiers', () => {
    const activity = makeActivity({ id: 'duplicate', eventId: 'wedding' });
    const result = parseStoredWorkspace(
      storedValue({
        version: 1,
        workspace: makeWorkspace({
          events: [makeEvent({ id: 'wedding' })],
          activities: [activity, activity],
        }),
      }),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.message).toMatch(/duplicate identifier/i);
    }
  });

  it('rejects activities and catering estimates that refer to a missing event', () => {
    const orphanActivity = parseStoredWorkspace(
      storedValue({
        version: 1,
        workspace: makeWorkspace({
          events: [makeEvent({ id: 'wedding' })],
          activities: [
            makeActivity({ id: 'orphan', eventId: 'missing' }),
          ],
        }),
      }),
    );

    expect(orphanActivity.ok).toBe(false);

    if (!orphanActivity.ok) {
      expect(orphanActivity.message).toMatch(/does not exist/i);
    }

    const orphanEstimate = parseStoredWorkspace(
      storedValue({
        version: 1,
        workspace: makeWorkspace({
          events: [makeEvent({ id: 'wedding' })],
          cateringEstimates: [
            makeCateringEstimate({ eventId: 'missing' }),
          ],
        }),
      }),
    );

    expect(orphanEstimate.ok).toBe(false);

    if (!orphanEstimate.ok) {
      expect(orphanEstimate.message).toMatch(/does not exist/i);
    }
  });

  it('allows at most one catering estimate per event', () => {
    const result = parseStoredWorkspace(
      storedValue({
        version: 1,
        workspace: makeWorkspace({
          events: [makeEvent({ id: 'wedding' })],
          cateringEstimates: [
            makeCateringEstimate({ eventId: 'wedding' }),
            makeCateringEstimate({
              eventId: 'wedding',
              updatedAt: '2026-10-25T00:00:00.000Z',
            }),
          ],
        }),
      }),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.message).toMatch(/at most one entry per event/i);
    }
  });

  it('rejects an unrecognised RSVP status instead of guessing', () => {
    const stored = JSON.parse(
      storedValue({
        version: 1,
        workspace: makeWorkspace({
          events: [makeEvent({ id: 'wedding' })],
          guests: [makeGuest({ id: 'guest', eventId: 'wedding' })],
        }),
      }),
    ) as { workspace: { guests: { rsvp: string }[] } };
    const guest = stored.workspace.guests[0];

    if (guest) {
      guest.rsvp = 'maybe';
    }

    const result = parseStoredWorkspace(JSON.stringify(stored));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.message).toMatch(/RSVP status is not recognised/i);
    }
  });
});
