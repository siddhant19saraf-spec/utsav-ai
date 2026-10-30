import type { CateringEstimateConfig, CelebrationEvent, Workspace } from '@/types/domain';
import type { RiskFinding, RiskProposalSnapshot } from '@/types/risk';
import {
  parseActivity,
  parseCateringEstimate,
  parseEvent,
  parseGuest,
  parseProposalSnapshot,
  parseRiskFinding,
  parseTask,
} from './workspaceSchema';
import { isRecord } from './workspaceValueParsers';

interface SkippedRecords {
  invalid: number;
  orphaned: number;
  duplicates: number;
}

function emptySkipped(): SkippedRecords {
  return { invalid: 0, orphaned: 0, duplicates: 0 };
}

function skippedMessages(label: string, skipped: SkippedRecords): string[] {
  const messages: string[] = [];

  if (skipped.invalid > 0) {
    const singular = skipped.invalid === 1;
    messages.push(
      `${skipped.invalid} saved ${label} ${singular ? 'record could' : 'records could'} not be read and ${singular ? 'was' : 'were'} skipped.`,
    );
  }

  if (skipped.orphaned > 0) {
    const singular = skipped.orphaned === 1;
    messages.push(
      `${skipped.orphaned} saved ${label} ${singular ? 'record referred' : 'records referred'} to a missing event and ${singular ? 'was' : 'were'} skipped.`,
    );
  }

  if (skipped.duplicates > 0) {
    const singular = skipped.duplicates === 1;
    messages.push(
      `${skipped.duplicates} duplicate ${label} ${singular ? 'record was' : 'records were'} skipped.`,
    );
  }

  return messages;
}

function readSalvageArray(
  value: unknown,
  label: string,
): { readonly values: readonly unknown[]; readonly issues: readonly string[] } {
  if (typeof value === 'undefined') {
    return { values: [], issues: [] };
  }

  if (!Array.isArray(value)) {
    return {
      values: [],
      issues: [`${label} were not in a readable format and were ignored.`],
    };
  }

  return { values: value, issues: [] };
}

function salvageIdCollection<T extends { readonly id: string }>(
  values: readonly unknown[],
  parseItem: (value: unknown, index: number) => T,
  eventIds: ReadonlySet<string>,
  getEventId: (item: T) => string,
): { readonly items: readonly T[]; readonly skipped: SkippedRecords } {
  const items: T[] = [];
  const seenIds = new Set<string>();
  const skipped = emptySkipped();

  values.forEach((value, index) => {
    let item: T;

    try {
      item = parseItem(value, index);
    } catch {
      skipped.invalid += 1;
      return;
    }

    if (!eventIds.has(getEventId(item))) {
      skipped.orphaned += 1;
      return;
    }

    if (seenIds.has(item.id)) {
      skipped.duplicates += 1;
      return;
    }

    seenIds.add(item.id);
    items.push(item);
  });

  return { items, skipped };
}

interface WorkspaceSalvage {
  readonly issues: readonly string[];
  readonly workspace: Workspace;
}

type WorkspaceSalvageResult =
  | { readonly ok: true; readonly salvage: WorkspaceSalvage }
  | { readonly ok: false; readonly message: string };

/**
 * Reads each record independently so one damaged row does not discard every
 * other saved event, task, guest, activity, estimate, or risk history record.
 * Invalid records are counted in safe messages; their contents are never echoed.
 */
export function salvageWorkspace(value: unknown): WorkspaceSalvageResult {
  if (!isRecord(value)) {
    return { ok: false, message: 'The saved workspace is not a readable object.' };
  }

  const rawEvents = value.events;

  if (!Array.isArray(rawEvents)) {
    return { ok: false, message: 'Saved events are not in a readable format.' };
  }

  const issues: string[] = [];
  const events: CelebrationEvent[] = [];
  const seenEventIds = new Set<string>();
  const skippedEvents = emptySkipped();

  rawEvents.forEach((rawEvent, index) => {
    let event: CelebrationEvent;

    try {
      event = parseEvent(rawEvent, index);
    } catch {
      skippedEvents.invalid += 1;
      return;
    }

    if (seenEventIds.has(event.id)) {
      skippedEvents.duplicates += 1;
      return;
    }

    seenEventIds.add(event.id);
    events.push(event);
  });

  if (rawEvents.length > 0 && events.length === 0) {
    return {
      ok: false,
      message: 'No saved event record could be read safely. The original saved data is unchanged.',
    };
  }

  issues.push(...skippedMessages('event', skippedEvents));
  const eventIds = new Set(events.map((event) => event.id));

  const rawTasks = readSalvageArray(value.tasks, 'Saved tasks');
  const tasks = salvageIdCollection(
    rawTasks.values,
    parseTask,
    eventIds,
    (task) => task.eventId,
  );
  issues.push(...rawTasks.issues, ...skippedMessages('task', tasks.skipped));

  const rawGuests = readSalvageArray(value.guests, 'Saved guests');
  const guests = salvageIdCollection(
    rawGuests.values,
    parseGuest,
    eventIds,
    (guest) => guest.eventId,
  );
  issues.push(...rawGuests.issues, ...skippedMessages('guest', guests.skipped));

  const rawActivities = readSalvageArray(value.activities, 'Saved activities');
  const activities = salvageIdCollection(
    rawActivities.values,
    parseActivity,
    eventIds,
    (activity) => activity.eventId,
  );
  issues.push(
    ...rawActivities.issues,
    ...skippedMessages('activity', activities.skipped),
  );

  const rawEstimates = readSalvageArray(
    value.cateringEstimates,
    'Saved catering estimates',
  );
  const cateringEstimates: CateringEstimateConfig[] = [];
  const seenEstimateEvents = new Set<string>();
  const skippedEstimates = emptySkipped();

  rawEstimates.values.forEach((rawEstimate, index) => {
    let estimate: CateringEstimateConfig;

    try {
      estimate = parseCateringEstimate(rawEstimate, index);
    } catch {
      skippedEstimates.invalid += 1;
      return;
    }

    if (!eventIds.has(estimate.eventId)) {
      skippedEstimates.orphaned += 1;
      return;
    }

    if (seenEstimateEvents.has(estimate.eventId)) {
      skippedEstimates.duplicates += 1;
      return;
    }

    seenEstimateEvents.add(estimate.eventId);
    cateringEstimates.push(estimate);
  });

  issues.push(
    ...rawEstimates.issues,
    ...skippedMessages('catering estimate', skippedEstimates),
  );

  let riskFindings: readonly RiskFinding[] | undefined;

  if (typeof value.riskFindings !== 'undefined') {
    const rawFindings = readSalvageArray(value.riskFindings, 'Saved risk findings');
    const salvagedFindings = salvageIdCollection(
      rawFindings.values,
      parseRiskFinding,
      eventIds,
      (finding) => finding.eventId,
    );
    issues.push(
      ...rawFindings.issues,
      ...skippedMessages('risk finding', salvagedFindings.skipped),
    );
    riskFindings = salvagedFindings.items;
  }

  let rescueProposalSnapshots: readonly RiskProposalSnapshot[] | undefined;

  if (typeof value.rescueProposalSnapshots !== 'undefined') {
    const rawSnapshots = readSalvageArray(
      value.rescueProposalSnapshots,
      'Saved rescue proposal snapshots',
    );
    const snapshotsByEvent = new Map<string, RiskProposalSnapshot>();
    const skippedSnapshots = emptySkipped();

    rawSnapshots.values.forEach((rawSnapshot, index) => {
      let snapshot: RiskProposalSnapshot;

      try {
        snapshot = parseProposalSnapshot(rawSnapshot, index);
      } catch {
        skippedSnapshots.invalid += 1;
        return;
      }

      if (!eventIds.has(snapshot.eventId)) {
        skippedSnapshots.orphaned += 1;
        return;
      }

      if (snapshotsByEvent.has(snapshot.eventId)) {
        skippedSnapshots.duplicates += 1;
      }

      // The newest recorded snapshot wins, matching normal proposal recording.
      snapshotsByEvent.set(snapshot.eventId, snapshot);
    });

    issues.push(
      ...rawSnapshots.issues,
      ...skippedMessages('rescue proposal snapshot', skippedSnapshots),
    );
    rescueProposalSnapshots = [...snapshotsByEvent.values()];
  }

  return {
    ok: true,
    salvage: {
      workspace: {
        events,
        tasks: tasks.items,
        guests: guests.items,
        activities: activities.items,
        cateringEstimates,
        ...(typeof riskFindings === 'undefined' ? {} : { riskFindings }),
        ...(typeof rescueProposalSnapshots === 'undefined'
          ? {}
          : { rescueProposalSnapshots }),
      },
      issues,
    },
  };
}
