import { isValidIsoDate } from '@/lib/date';
import { isValidLocalDateTime } from '@/lib/dateTime';
import { formatCount } from '@/lib/format';
import { MAX_EVENT_GUESTS } from '@/lib/limits';
import { validateBudget } from '@/features/budget/validation';
import type { BudgetCategory, BudgetFlexibility, EventBudget } from '@/types/budget';
import type {
  CateringEstimateConfig,
  CelebrationEvent,
  Guest,
  PlanningTask,
  RsvpStatus,
  TaskStatus,
  TimelineActivity,
  Workspace,
} from '@/types/domain';
import type {
  RiskEntityRef,
  RiskEvidence,
  RiskFinding,
  RiskProposalChangeSnapshot,
  RiskProposalSnapshot,
} from '@/types/risk';
import {
  activityPriorities,
  activityStatuses,
  eventCategories,
  eventSettings,
  fail,
  origins,
  parseBoolean,
  parseBudgetInr,
  parseBufferPercent,
  parseEnum,
  parseInr,
  parseList,
  parseNonNegativeInteger,
  parseOptionalBoolean,
  parseOptionalEnum,
  parseOptionalString,
  parseOptionalTimestamp,
  parsePositiveInteger,
  parseRecord,
  parseString,
  parseTimestamp,
  planningStatuses,
  riskCategories,
  riskCertainties,
  riskEntityTypes,
  riskFindingStatuses,
  riskReopenReasons,
  riskSeverities,
  rsvpStatuses,
  taskPriorities,
  taskStatuses,
} from './workspaceValueParsers';

function parseFlexibility(value: unknown, label: string): BudgetFlexibility {
  const record = parseRecord(value, label);
  const mode = parseEnum(record.mode, ['protected', 'flexible'] as const, `${label} mode`);

  if (mode === 'protected') {
    return { mode };
  }

  return {
    mode,
    minimumPlanned: parseBudgetInr(record.minimumPlanned, `${label} minimum allocation`),
  };
}

function parseCategory(value: unknown, index: number): BudgetCategory {
  const label = `Budget category ${index + 1}`;
  const record = parseRecord(value, label);
  const notes = parseOptionalString(record.notes, `${label} notes`, 400);

  return {
    id: parseString(record.id, `${label} identifier`, { maxLength: 64 }),
    name: parseString(record.name, `${label} name`, { maxLength: 80 }),
    planned: parseBudgetInr(record.planned, `${label} planned amount`),
    actual: parseBudgetInr(record.actual, `${label} actual amount`),
    flexibility: parseFlexibility(record.flexibility, `${label} flexibility`),
    ...(typeof notes === 'undefined' ? {} : { notes }),
  };
}

function parseBudget(value: unknown, eventId: string): EventBudget {
  const record = parseRecord(value, 'Event budget');
  const categoryValues = record.categories;

  if (!Array.isArray(categoryValues)) {
    fail('Budget categories must be an array.');
  }

  const reserve = parseRecord(record.emergencyReserve, 'Emergency reserve configuration');
  const budget: EventBudget = {
    id: parseString(record.id, 'Budget identifier', { maxLength: 80 }),
    eventId: parseString(record.eventId, 'Budget event identifier', { maxLength: 80 }),
    totalAvailable: parseBudgetInr(record.totalAvailable, 'Total available budget'),
    categories: categoryValues.map((category, index) => parseCategory(category, index)),
    emergencyReserve: {
      enabled: parseBoolean(reserve.enabled, 'Emergency reserve enabled flag'),
      target: parseBudgetInr(reserve.target, 'Emergency reserve target'),
    },
    createdAt: parseTimestamp(record.createdAt, 'Budget creation timestamp'),
    updatedAt: parseTimestamp(record.updatedAt, 'Budget update timestamp'),
  };

  if (budget.eventId !== eventId) {
    fail('Budget event identifier does not match its event.');
  }

  const validation = validateBudget(budget);

  if (!validation.isValid) {
    // Validation messages can include category names, so only the stable code
    // is reported at this boundary.
    const code = validation.errors[0]?.code;
    fail(`Budget data is invalid${code ? ` (${code})` : ''}.`);
  }

  return budget;
}

export function parseEvent(value: unknown, index: number): CelebrationEvent {
  const label = `Event ${index + 1}`;
  const record = parseRecord(value, label);
  const id = parseString(record.id, `${label} identifier`, { maxLength: 80 });
  const venue = parseOptionalString(record.venue, `${label} venue`, 160);
  const startsAt = parseString(record.startsAt, `${label} start date`, { maxLength: 10 });
  const setting = parseOptionalEnum(record.setting, eventSettings, `${label} setting`);
  const rawTheme = parseOptionalString(record.theme, `${label} theme`, 80);
  const theme = rawTheme?.trim() ? rawTheme.trim() : undefined;
  const accessibilityRequired = parseOptionalBoolean(
    record.accessibilityRequired,
    `${label} accessibility required flag`,
  );
  const accessibilityAddressed = parseOptionalBoolean(
    record.accessibilityAddressed,
    `${label} accessibility addressed flag`,
  );
  const contingencyPlanConfirmed = parseOptionalBoolean(
    record.contingencyPlanConfirmed,
    `${label} contingency plan flag`,
  );
  const updatedAt =
    typeof record.updatedAt === 'undefined'
      ? undefined
      : parseTimestamp(record.updatedAt, `${label} update timestamp`);
  const expectedGuests = parsePositiveInteger(
    record.expectedGuests,
    `${label} expected guests`,
  );

  if (!isValidIsoDate(startsAt)) {
    fail(`${label} start date must use the YYYY-MM-DD calendar format.`);
  }

  if (expectedGuests > MAX_EVENT_GUESTS) {
    fail(
      `${label} expected guests must not exceed ${formatCount(MAX_EVENT_GUESTS)}.`,
    );
  }

  return {
    id,
    name: parseString(record.name, `${label} name`, { maxLength: 120 }),
    category: parseEnum(record.category, eventCategories, `${label} category`),
    startsAt,
    expectedGuests,
    budget: parseBudget(record.budget, id),
    status: parseEnum(record.status, planningStatuses, `${label} status`),
    origin: parseEnum(record.origin, origins, `${label} origin`),
    ...(typeof venue === 'undefined' ? {} : { venue }),
    ...(typeof setting === 'undefined' ? {} : { setting }),
    ...(typeof theme === 'undefined' ? {} : { theme }),
    ...(typeof accessibilityRequired === 'undefined' ? {} : { accessibilityRequired }),
    ...(typeof accessibilityAddressed === 'undefined' ? {} : { accessibilityAddressed }),
    ...(typeof contingencyPlanConfirmed === 'undefined'
      ? {}
      : { contingencyPlanConfirmed }),
    ...(typeof updatedAt === 'undefined' ? {} : { updatedAt }),
  };
}

function parseTaskStatus(record: Record<string, unknown>, label: string): TaskStatus {
  if (typeof record.status !== 'undefined') {
    return parseEnum(record.status, taskStatuses, `${label} status`);
  }

  if (typeof record.completed === 'undefined') {
    fail(`${label} status is missing.`);
  }

  return parseBoolean(record.completed, `${label} completed flag`)
    ? 'completed'
    : 'open';
}

export function parseTask(value: unknown, index: number): PlanningTask {
  const label = `Task ${index + 1}`;
  const record = parseRecord(value, label);
  const dueDate = parseString(record.dueDate, `${label} due date`, { maxLength: 10 });
  const description = parseOptionalString(record.description, `${label} description`, 1_000);
  const assignee = parseOptionalString(record.assignee, `${label} assignee`, 80);
  const createdAt = parseOptionalTimestamp(record.createdAt, `${label} creation timestamp`);
  const updatedAt = parseOptionalTimestamp(record.updatedAt, `${label} update timestamp`);

  if (!isValidIsoDate(dueDate)) {
    fail(`${label} due date must use the YYYY-MM-DD calendar format.`);
  }

  return {
    id: parseString(record.id, `${label} identifier`, { maxLength: 80 }),
    eventId: parseString(record.eventId, `${label} event identifier`, { maxLength: 80 }),
    title: parseString(record.title, `${label} title`, { maxLength: 160 }),
    dueDate,
    priority: parseEnum(record.priority, taskPriorities, `${label} priority`),
    status: parseTaskStatus(record, label),
    ...(typeof description === 'undefined' ? {} : { description }),
    ...(typeof assignee === 'undefined' ? {} : { assignee }),
    ...(typeof createdAt === 'undefined' ? {} : { createdAt }),
    ...(typeof updatedAt === 'undefined' ? {} : { updatedAt }),
  };
}

function parseRsvp(value: unknown, label: string): RsvpStatus {
  if (value === 'attending') {
    return 'confirmed';
  }

  if (value === 'waitlisted') {
    return 'pending';
  }

  return parseEnum(value, rsvpStatuses, label);
}

export function parseGuest(value: unknown, index: number): Guest {
  const label = `Guest ${index + 1}`;
  const record = parseRecord(value, label);
  const email = parseOptionalString(record.email, `${label} email`, 200);
  const dietaryPreference = parseOptionalString(
    record.dietaryPreference,
    `${label} dietary preference`,
    200,
  );
  const legacyDietaryNotes = parseOptionalString(
    record.dietaryNotes,
    `${label} dietary notes`,
    300,
  );
  const dietary = dietaryPreference ?? legacyDietaryNotes;
  const accessibilityRequest = parseOptionalString(
    record.accessibilityRequest,
    `${label} accessibility request`,
    300,
  );
  const notes = parseOptionalString(record.notes, `${label} notes`, 500);
  const createdAt = parseOptionalTimestamp(record.createdAt, `${label} creation timestamp`);
  const updatedAt = parseOptionalTimestamp(record.updatedAt, `${label} update timestamp`);

  return {
    id: parseString(record.id, `${label} identifier`, { maxLength: 80 }),
    eventId: parseString(record.eventId, `${label} event identifier`, { maxLength: 80 }),
    name: parseString(record.name, `${label} name`, { maxLength: 120 }),
    rsvp: parseRsvp(record.rsvp, `${label} RSVP status`),
    ...(typeof email === 'undefined' ? {} : { email }),
    ...(typeof dietary === 'undefined' ? {} : { dietaryPreference: dietary }),
    ...(typeof accessibilityRequest === 'undefined' ? {} : { accessibilityRequest }),
    ...(typeof notes === 'undefined' ? {} : { notes }),
    ...(typeof createdAt === 'undefined' ? {} : { createdAt }),
    ...(typeof updatedAt === 'undefined' ? {} : { updatedAt }),
  };
}

export function parseActivity(value: unknown, index: number): TimelineActivity {
  const label = `Activity ${index + 1}`;
  const record = parseRecord(value, label);
  const startsAt = parseString(record.startsAt, `${label} start`, { maxLength: 16 });
  const endsAt = parseString(record.endsAt, `${label} end`, { maxLength: 16 });
  const description = parseOptionalString(record.description, `${label} description`, 1_000);
  const location = parseOptionalString(record.location, `${label} location`, 160);

  if (!isValidLocalDateTime(startsAt)) {
    fail(`${label} start must use the YYYY-MM-DDTHH:mm local date-time format.`);
  }

  if (!isValidLocalDateTime(endsAt)) {
    fail(`${label} end must use the YYYY-MM-DDTHH:mm local date-time format.`);
  }

  if (endsAt <= startsAt) {
    fail(`${label} end time must be after its start time.`);
  }

  return {
    id: parseString(record.id, `${label} identifier`, { maxLength: 80 }),
    eventId: parseString(record.eventId, `${label} event identifier`, { maxLength: 80 }),
    title: parseString(record.title, `${label} title`, { maxLength: 160 }),
    startsAt,
    endsAt,
    priority: parseEnum(record.priority, activityPriorities, `${label} priority`),
    status: parseEnum(record.status, activityStatuses, `${label} status`),
    createdAt: parseTimestamp(record.createdAt, `${label} creation timestamp`),
    updatedAt: parseTimestamp(record.updatedAt, `${label} update timestamp`),
    ...(typeof description === 'undefined' ? {} : { description }),
    ...(typeof location === 'undefined' ? {} : { location }),
  };
}

export function parseCateringEstimate(
  value: unknown,
  index: number,
): CateringEstimateConfig {
  const label = `Catering estimate ${index + 1}`;
  const record = parseRecord(value, label);

  return {
    eventId: parseString(record.eventId, `${label} event identifier`, { maxLength: 80 }),
    perPersonCost: parseInr(record.perPersonCost, `${label} per-person cost`),
    bufferPercent: parseBufferPercent(record.bufferPercent, `${label} buffer`),
    updatedAt: parseTimestamp(record.updatedAt, `${label} update timestamp`),
  };
}

function parseRiskEntityRef(value: unknown, index: number): RiskEntityRef {
  const label = `Risk entity reference ${index + 1}`;
  const record = parseRecord(value, label);

  return {
    type: parseEnum(record.type, riskEntityTypes, `${label} type`),
    id: parseString(record.id, `${label} identifier`, { maxLength: 160 }),
  };
}

function parseRiskEvidence(value: unknown, index: number): RiskEvidence {
  const label = `Risk evidence ${index + 1}`;
  const record = parseRecord(value, label);

  return {
    label: parseString(record.label, `${label} label`, { maxLength: 120 }),
    value: parseString(record.value, `${label} value`, { maxLength: 500 }),
  };
}

export function parseRiskFinding(value: unknown, index: number): RiskFinding {
  const label = `Risk finding ${index + 1}`;
  const record = parseRecord(value, label);
  const resolvedAt = parseOptionalTimestamp(record.resolvedAt, `${label} resolved timestamp`);
  const dismissedAt = parseOptionalTimestamp(
    record.dismissedAt,
    `${label} dismissed timestamp`,
  );
  const reopenedAt = parseOptionalTimestamp(record.reopenedAt, `${label} reopened timestamp`);
  const reopenReason = parseOptionalEnum(
    record.reopenReason,
    riskReopenReasons,
    `${label} reopen reason`,
  );

  return {
    id: parseString(record.id, `${label} identifier`, { maxLength: 300 }),
    eventId: parseString(record.eventId, `${label} event identifier`, { maxLength: 80 }),
    category: parseEnum(record.category, riskCategories, `${label} category`),
    severity: parseEnum(record.severity, riskSeverities, `${label} severity`),
    certainty: parseEnum(record.certainty, riskCertainties, `${label} certainty`),
    title: parseString(record.title, `${label} title`, { maxLength: 200 }),
    explanation: parseString(record.explanation, `${label} explanation`, {
      maxLength: 2_000,
    }),
    evidence: parseList(record.evidence, `${label} evidence`, 20, parseRiskEvidence),
    recommendedAction: parseString(record.recommendedAction, `${label} recommended action`, {
      maxLength: 2_000,
    }),
    relatedEntities: parseList(
      record.relatedEntities,
      `${label} related entities`,
      50,
      parseRiskEntityRef,
    ),
    detectedAt: parseTimestamp(record.detectedAt, `${label} detected timestamp`),
    lastDetectedAt: parseTimestamp(
      record.lastDetectedAt,
      `${label} last detected timestamp`,
    ),
    status: parseEnum(record.status, riskFindingStatuses, `${label} status`),
    sourceModule: parseString(record.sourceModule, `${label} source module`, {
      maxLength: 80,
    }),
    ruleId: parseString(record.ruleId, `${label} rule identifier`, { maxLength: 120 }),
    fingerprint: parseString(record.fingerprint, `${label} fingerprint`, {
      maxLength: 200,
    }),
    statusChangedAt: parseTimestamp(
      record.statusChangedAt,
      `${label} status changed timestamp`,
    ),
    ...(typeof resolvedAt === 'undefined' ? {} : { resolvedAt }),
    ...(typeof dismissedAt === 'undefined' ? {} : { dismissedAt }),
    ...(typeof reopenedAt === 'undefined' ? {} : { reopenedAt }),
    ...(typeof reopenReason === 'undefined' ? {} : { reopenReason }),
  };
}

function parseProposalChangeSnapshot(
  value: unknown,
  index: number,
): RiskProposalChangeSnapshot {
  const label = `Proposal change ${index + 1}`;
  const record = parseRecord(value, label);
  const categoryId = parseOptionalString(record.categoryId, `${label} category identifier`, 64);

  return {
    label: parseString(record.label, `${label} label`, { maxLength: 200 }),
    before: parseString(record.before, `${label} previous value`, {
      allowEmpty: true,
      maxLength: 500,
    }),
    after: parseString(record.after, `${label} new value`, {
      allowEmpty: true,
      maxLength: 500,
    }),
    impact: parseString(record.impact, `${label} impact`, { maxLength: 500 }),
    ...(typeof categoryId === 'undefined' ? {} : { categoryId }),
  };
}

function parseCategoryIdList(value: unknown, label: string): readonly string[] {
  return parseList(value, label, 100, (entry, index) =>
    parseString(entry, `${label} entry ${index + 1}`, { maxLength: 64 }),
  );
}

export function parseProposalSnapshot(value: unknown, index: number): RiskProposalSnapshot {
  const label = `Proposal snapshot ${index + 1}`;
  const record = parseRecord(value, label);
  const changes = parseList(
    record.changes,
    `${label} changes`,
    50,
    parseProposalChangeSnapshot,
  );
  const changeCount = parseNonNegativeInteger(record.changeCount, `${label} change count`);

  if (changeCount !== changes.length) {
    fail(`${label} change count does not match its changes.`);
  }

  return {
    proposalId: parseString(record.proposalId, `${label} proposal identifier`, {
      maxLength: 200,
    }),
    eventId: parseString(record.eventId, `${label} event identifier`, { maxLength: 80 }),
    createdAt: parseTimestamp(record.createdAt, `${label} creation timestamp`),
    originalEventSignature: parseString(
      record.originalEventSignature,
      `${label} event signature`,
      { maxLength: 65_536 },
    ),
    relatedDataSignature: parseString(
      record.relatedDataSignature,
      `${label} related data signature`,
      { maxLength: 200 },
    ),
    protectedCategoryIds: parseCategoryIdList(
      record.protectedCategoryIds,
      `${label} protected categories`,
    ),
    affectedCategoryIds: parseCategoryIdList(
      record.affectedCategoryIds,
      `${label} affected categories`,
    ),
    changeCount,
    changes,
    isValid: parseBoolean(record.isValid, `${label} validity flag`),
    unresolvedIssueCount: parseNonNegativeInteger(
      record.unresolvedIssueCount,
      `${label} unresolved issue count`,
    ),
  };
}

function ensureUniqueIds(items: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();

  for (const item of items) {
    if (ids.has(item.id)) {
      fail(`${label} contain a duplicate identifier.`);
    }

    ids.add(item.id);
  }
}

function parseOptionalArray(
  value: unknown,
  label: string,
): readonly unknown[] {
  if (typeof value === 'undefined') {
    return [];
  }

  if (!Array.isArray(value)) {
    fail(`${label} must be an array.`);
  }

  return value;
}

function parseRiskFields(
  record: Record<string, unknown>,
  eventIds: ReadonlySet<string>,
): Pick<Workspace, 'riskFindings' | 'rescueProposalSnapshots'> {
  let riskFindings: readonly RiskFinding[] | undefined;
  let rescueProposalSnapshots: readonly RiskProposalSnapshot[] | undefined;

  if (typeof record.riskFindings !== 'undefined') {
    const values = parseOptionalArray(record.riskFindings, 'Risk findings');
    riskFindings = values.map((finding, index) => parseRiskFinding(finding, index));
    ensureUniqueIds(riskFindings, 'Risk findings');

    for (const finding of riskFindings) {
      if (!eventIds.has(finding.eventId)) {
        fail('A risk finding refers to an event that does not exist.');
      }
    }
  }

  if (typeof record.rescueProposalSnapshots !== 'undefined') {
    const values = parseOptionalArray(
      record.rescueProposalSnapshots,
      'Rescue proposal snapshots',
    );
    rescueProposalSnapshots = values.map((snapshot, index) =>
      parseProposalSnapshot(snapshot, index),
    );
    const snapshotEventIds = new Set<string>();

    for (const snapshot of rescueProposalSnapshots) {
      if (!eventIds.has(snapshot.eventId)) {
        fail('A rescue proposal snapshot refers to an event that does not exist.');
      }

      if (snapshotEventIds.has(snapshot.eventId)) {
        fail('Rescue proposal snapshots must contain at most one entry per event.');
      }

      snapshotEventIds.add(snapshot.eventId);
    }
  }

  return {
    ...(typeof riskFindings === 'undefined' ? {} : { riskFindings }),
    ...(typeof rescueProposalSnapshots === 'undefined'
      ? {}
      : { rescueProposalSnapshots }),
  };
}

export function parseWorkspace(value: unknown): Workspace {
  const record = parseRecord(value, 'Workspace');

  if (!Array.isArray(record.events) || !Array.isArray(record.tasks) || !Array.isArray(record.guests)) {
    fail('Workspace events, tasks, and guests must be arrays.');
  }

  const events = record.events.map((event, index) => parseEvent(event, index));
  const tasks = record.tasks.map((task, index) => parseTask(task, index));
  const guests = record.guests.map((guest, index) => parseGuest(guest, index));
  const activities = parseOptionalArray(record.activities, 'Workspace activities').map(
    (activity, index) => parseActivity(activity, index),
  );
  const cateringEstimates = parseOptionalArray(
    record.cateringEstimates,
    'Workspace catering estimates',
  ).map((estimate, index) => parseCateringEstimate(estimate, index));
  ensureUniqueIds(events, 'Events');
  ensureUniqueIds(tasks, 'Tasks');
  ensureUniqueIds(guests, 'Guests');
  ensureUniqueIds(activities, 'Activities');

  const eventIds = new Set(events.map((event) => event.id));

  for (const task of tasks) {
    if (!eventIds.has(task.eventId)) {
      fail('A task refers to an event that does not exist.');
    }
  }

  for (const guest of guests) {
    if (!eventIds.has(guest.eventId)) {
      fail('A guest refers to an event that does not exist.');
    }
  }

  for (const activity of activities) {
    if (!eventIds.has(activity.eventId)) {
      fail('An activity refers to an event that does not exist.');
    }
  }

  const estimateEventIds = new Set<string>();

  for (const estimate of cateringEstimates) {
    if (!eventIds.has(estimate.eventId)) {
      fail('A catering estimate refers to an event that does not exist.');
    }

    if (estimateEventIds.has(estimate.eventId)) {
      fail('Catering estimates must contain at most one entry per event.');
    }

    estimateEventIds.add(estimate.eventId);
  }

  return {
    events,
    tasks,
    guests,
    activities,
    cateringEstimates,
    ...parseRiskFields(record, eventIds),
  };
}

export function isSupportedVersion(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2;
}
