import { isValidIsoDate } from '@/lib/date';
import { isValidLocalDateTime } from '@/lib/dateTime';
import { isValidMoney } from '@/lib/money';
import { validateBudget } from '@/features/budget/validation';
import type { BudgetCategory, BudgetFlexibility, EventBudget } from '@/types/budget';
import type {
  ActivityPriority,
  ActivityStatus,
  CateringEstimateConfig,
  CelebrationEvent,
  EventCategory,
  EventSetting,
  Guest,
  Money,
  PlanningStatus,
  PlanningTask,
  RsvpStatus,
  TaskPriority,
  TaskStatus,
  TimelineActivity,
  Workspace,
} from '@/types/domain';
import type {
  RiskCategory,
  RiskCertainty,
  RiskEntityRef,
  RiskEntityType,
  RiskEvidence,
  RiskFinding,
  RiskFindingStatus,
  RiskProposalChangeSnapshot,
  RiskProposalSnapshot,
  RiskReopenReason,
  RiskSeverity,
} from '@/types/risk';

export const WORKSPACE_STORAGE_KEY = 'utsav-ai.workspace.v1';
export const WORKSPACE_RECOVERY_KEY = 'utsav-ai.workspace.recovery.v1';
const WORKSPACE_STORAGE_VERSION = 2;
const MAX_IMPORT_LENGTH = 5_000_000;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type RecoveryCopyStatus = 'saved' | 'existing' | 'failed';

export type LoadWorkspaceResult =
  | { readonly status: 'loaded'; readonly workspace: Workspace }
  | {
      readonly status: 'partial';
      readonly workspace: Workspace;
      /** Safe summary of skipped records. Never includes record contents. */
      readonly message: string;
      readonly issues: readonly string[];
      readonly recovery: RecoveryCopyStatus;
    }
  | { readonly status: 'empty' }
  | {
      readonly status: 'invalid';
      readonly message: string;
      readonly recovery: RecoveryCopyStatus;
    }
  | { readonly status: 'unavailable'; readonly message: string };

export type SaveWorkspaceFailureCode = 'unavailable' | 'quota' | 'write-failed';

export type SaveWorkspaceResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: SaveWorkspaceFailureCode;
      readonly message: string;
    };

export type ParseWorkspaceResult =
  | { readonly ok: true; readonly workspace: Workspace }
  | { readonly ok: false; readonly message: string };

export type ExportWorkspaceResult =
  | { readonly ok: true; readonly json: string }
  | { readonly ok: false; readonly message: string };

export type ImportWorkspaceResult =
  | { readonly ok: true; readonly workspace: Workspace }
  | { readonly ok: false; readonly message: string };

const eventCategories: readonly EventCategory[] = [
  'wedding',
  'birthday',
  'corporate',
  'anniversary',
  'festival',
  'other',
];
const planningStatuses: readonly PlanningStatus[] = [
  'draft',
  'planning',
  'on-track',
  'at-risk',
  'completed',
];
const eventSettings: readonly EventSetting[] = ['indoor', 'outdoor', 'mixed'];
const taskPriorities: readonly TaskPriority[] = ['low', 'medium', 'high'];
const taskStatuses: readonly TaskStatus[] = ['open', 'completed'];
const activityPriorities: readonly ActivityPriority[] = ['low', 'medium', 'high'];
const activityStatuses: readonly ActivityStatus[] = ['scheduled', 'completed'];
const rsvpStatuses: readonly RsvpStatus[] = ['pending', 'confirmed', 'declined'];
const origins = ['sample', 'user'] as const;
const riskCategories: readonly RiskCategory[] = [
  'financial',
  'scheduling',
  'guest-catering',
  'venue-contingency',
  'proposal-consistency',
];
const riskSeverities: readonly RiskSeverity[] = ['critical', 'high', 'medium', 'low'];
const riskCertainties: readonly RiskCertainty[] = [
  'confirmed',
  'potential',
  'missing-data',
  'assumption',
];
const riskFindingStatuses: readonly RiskFindingStatus[] = [
  'open',
  'resolved',
  'dismissed',
];
const riskEntityTypes: readonly RiskEntityType[] = [
  'event',
  'budget',
  'budget-category',
  'task',
  'activity',
  'guest',
  'catering-estimate',
  'rescue-proposal',
];
const riskReopenReasons: readonly RiskReopenReason[] = [
  'reappeared',
  'detection-changed',
  'dismissal-undone',
];
const MAX_BUFFER_PERCENT = 100;

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecord(value: unknown, label: string): Record<string, unknown> {
  return isRecord(value) ? value : fail(`${label} must be an object.`);
}

function parseString(
  value: unknown,
  label: string,
  options: { readonly allowEmpty?: boolean; readonly maxLength?: number } = {},
): string {
  if (typeof value !== 'string') {
    fail(`${label} must be text.`);
  }

  if (!options.allowEmpty && !value.trim()) {
    fail(`${label} cannot be empty.`);
  }

  if (typeof options.maxLength === 'number' && value.length > options.maxLength) {
    fail(`${label} is too long.`);
  }

  return value;
}

function parseOptionalString(value: unknown, label: string, maxLength: number): string | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return parseString(value, label, { allowEmpty: true, maxLength });
}

function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    fail(`${label} must be true or false.`);
  }

  return value;
}

function parseOptionalBoolean(value: unknown, label: string): boolean | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return parseBoolean(value, label);
}

function parseNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`);
  }

  return value;
}

function parsePositiveInteger(value: unknown, label: string): number {
  const parsed = parseNonNegativeInteger(value, label);

  if (parsed <= 0) {
    fail(`${label} must be greater than zero.`);
  }

  return parsed;
}

function parseInr(value: unknown, label: string): Money {
  if (!isValidMoney(value) || value.currency !== 'INR') {
    fail(`${label} must be a non-negative integer INR amount.`);
  }

  return { amountMinor: value.amountMinor, currency: 'INR' };
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(`${label} is not recognised.`);
  }

  return value as T;
}

function parseOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return parseEnum(value, allowed, label);
}

function parseTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    fail(`${label} must be a valid ISO date-time.`);
  }

  return value;
}

function parseOptionalTimestamp(value: unknown, label: string): string | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return parseTimestamp(value, label);
}

function parseList<T>(
  value: unknown,
  label: string,
  maxLength: number,
  parseItem: (item: unknown, index: number) => T,
): readonly T[] {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array.`);
  }

  if (value.length > maxLength) {
    fail(`${label} has too many entries.`);
  }

  return value.map((item, index) => parseItem(item, index));
}

function parseBufferPercent(value: unknown, label: string): number {
  const parsed = parseNonNegativeInteger(value, label);

  if (parsed > MAX_BUFFER_PERCENT) {
    fail(`${label} must be between 0 and ${MAX_BUFFER_PERCENT}.`);
  }

  return parsed;
}

function parseFlexibility(value: unknown, label: string): BudgetFlexibility {
  const record = parseRecord(value, label);
  const mode = parseEnum(record.mode, ['protected', 'flexible'] as const, `${label} mode`);

  if (mode === 'protected') {
    return { mode };
  }

  return {
    mode,
    minimumPlanned: parseInr(record.minimumPlanned, `${label} minimum allocation`),
  };
}

function parseCategory(value: unknown, index: number): BudgetCategory {
  const label = `Budget category ${index + 1}`;
  const record = parseRecord(value, label);
  const notes = parseOptionalString(record.notes, `${label} notes`, 400);

  return {
    id: parseString(record.id, `${label} identifier`, { maxLength: 64 }),
    name: parseString(record.name, `${label} name`, { maxLength: 80 }),
    planned: parseInr(record.planned, `${label} planned amount`),
    actual: parseInr(record.actual, `${label} actual amount`),
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
    totalAvailable: parseInr(record.totalAvailable, 'Total available budget'),
    categories: categoryValues.map((category, index) => parseCategory(category, index)),
    emergencyReserve: {
      enabled: parseBoolean(reserve.enabled, 'Emergency reserve enabled flag'),
      target: parseInr(reserve.target, 'Emergency reserve target'),
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

function parseEvent(value: unknown, index: number): CelebrationEvent {
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

  if (!isValidIsoDate(startsAt)) {
    fail(`${label} start date must use the YYYY-MM-DD calendar format.`);
  }

  return {
    id,
    name: parseString(record.name, `${label} name`, { maxLength: 120 }),
    category: parseEnum(record.category, eventCategories, `${label} category`),
    startsAt,
    expectedGuests: parsePositiveInteger(record.expectedGuests, `${label} expected guests`),
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

function parseTask(value: unknown, index: number): PlanningTask {
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

function parseGuest(value: unknown, index: number): Guest {
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

function parseActivity(value: unknown, index: number): TimelineActivity {
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

function parseCateringEstimate(
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

function parseRiskFinding(value: unknown, index: number): RiskFinding {
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

function parseProposalSnapshot(value: unknown, index: number): RiskProposalSnapshot {
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
      { maxLength: 200 },
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

function parseWorkspace(value: unknown): Workspace {
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

function isSupportedVersion(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2;
}

interface DecodedWorkspace {
  readonly workspace: unknown;
  readonly version: 1 | 2;
}

type DecodeWorkspaceResult =
  | { readonly ok: true; readonly decoded: DecodedWorkspace }
  | { readonly ok: false; readonly message: string };

function decodeWorkspace(raw: string): DecodeWorkspaceResult {
  let decoded: unknown;

  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'The saved workspace is not valid JSON.' };
  }

  if (!isRecord(decoded) || !isSupportedVersion(decoded.version)) {
    return { ok: false, message: 'The saved workspace version is not supported.' };
  }

  return {
    ok: true,
    decoded: { workspace: decoded.workspace, version: decoded.version },
  };
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The saved workspace could not be read.';
}

export function parseStoredWorkspace(raw: string): ParseWorkspaceResult {
  const decoded = decodeWorkspace(raw);

  if (!decoded.ok) {
    return { ok: false, message: decoded.message };
  }

  try {
    return { ok: true, workspace: parseWorkspace(decoded.decoded.workspace) };
  } catch (error) {
    return {
      ok: false,
      message: `The saved workspace could not be read: ${safeErrorMessage(error)}`,
    };
  }
}

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
function salvageWorkspace(value: unknown): WorkspaceSalvageResult {
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

function recoveryNote(status: RecoveryCopyStatus): string {
  if (status === 'saved') {
    return ' A recovery copy of the unreadable saved data was kept in this browser.';
  }

  if (status === 'existing') {
    return ' An earlier recovery copy of unreadable saved data is still kept in this browser.';
  }

  return ' A recovery copy could not be saved; the original saved data stays in place until your next change.';
}

function writeRecoveryCopy(
  storage: StorageLike,
  raw: string,
  reason: 'invalid' | 'partial',
): RecoveryCopyStatus {
  try {
    if (storage.getItem(WORKSPACE_RECOVERY_KEY) !== null) {
      return 'existing';
    }

    storage.setItem(
      WORKSPACE_RECOVERY_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        reason,
        payload: raw,
      }),
    );
    return 'saved';
  } catch {
    return 'failed';
  }
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadWorkspaceFromStorage(
  storage: StorageLike | null = getBrowserStorage(),
): LoadWorkspaceResult {
  if (!storage) {
    return {
      status: 'unavailable',
      message: 'Local saving is unavailable. Changes stay in memory for this tab.',
    };
  }

  let raw: string | null;

  try {
    raw = storage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return {
      status: 'unavailable',
      message: 'Saved data could not be accessed. Changes stay in memory for this tab.',
    };
  }

  if (raw === null) {
    return { status: 'empty' };
  }

  const decoded = decodeWorkspace(raw);

  if (!decoded.ok) {
    const recovery = writeRecoveryCopy(storage, raw, 'invalid');

    return {
      status: 'invalid',
      message: `${decoded.message}${recoveryNote(recovery)}`,
      recovery,
    };
  }

  const salvaged = salvageWorkspace(decoded.decoded.workspace);

  if (!salvaged.ok) {
    const recovery = writeRecoveryCopy(storage, raw, 'invalid');

    return {
      status: 'invalid',
      message: `${salvaged.message}${recoveryNote(recovery)}`,
      recovery,
    };
  }

  if (salvaged.salvage.issues.length > 0) {
    const recovery = writeRecoveryCopy(storage, raw, 'partial');

    return {
      status: 'partial',
      workspace: salvaged.salvage.workspace,
      message: `Some saved records were skipped so the rest of your data could load. ${salvaged.salvage.issues.join(' ')}${recoveryNote(recovery)}`,
      issues: salvaged.salvage.issues,
      recovery,
    };
  }

  return { status: 'loaded', workspace: salvaged.salvage.workspace };
}

function isQuotaExceeded(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };

  return (
    candidate.name === 'QuotaExceededError' ||
    candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    candidate.code === 22 ||
    candidate.code === 1014 ||
    (typeof candidate.message === 'string' &&
      candidate.message.includes('QuotaExceeded'))
  );
}

export function saveWorkspaceToStorage(
  workspace: Workspace,
  storage: StorageLike | null = getBrowserStorage(),
): SaveWorkspaceResult {
  if (!storage) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'Local saving is unavailable. Changes stay in memory for this tab.',
    };
  }

  let serialized: string;

  try {
    serialized = JSON.stringify({
      version: WORKSPACE_STORAGE_VERSION,
      workspace,
    });
  } catch {
    return {
      ok: false,
      code: 'write-failed',
      message:
        'Changes could not be prepared for saving. They remain available in this tab.',
    };
  }

  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, serialized);
    return { ok: true };
  } catch (error) {
    if (isQuotaExceeded(error)) {
      return {
        ok: false,
        code: 'quota',
        message:
          'Changes could not be saved because this browser’s local storage is full. Export a backup, free up space, or remove sample data. Your edits remain available in this tab.',
      };
    }

    return {
      ok: false,
      code: 'write-failed',
      message:
        'Changes could not be saved to this browser. They remain available in this tab. Export a backup before closing the tab.',
    };
  }
}

export function exportWorkspaceToJson(workspace: Workspace): ExportWorkspaceResult {
  try {
    parseWorkspace(workspace);

    return {
      ok: true,
      json: JSON.stringify(
        {
          version: WORKSPACE_STORAGE_VERSION,
          exportedAt: new Date().toISOString(),
          workspace,
        },
        null,
        2,
      ),
    };
  } catch {
    return {
      ok: false,
      message:
        'This workspace could not be exported because some data is not valid. Review the latest validation messages and try again.',
    };
  }
}

export function importWorkspaceFromJson(raw: string): ImportWorkspaceResult {
  if (!raw.trim()) {
    return { ok: false, message: 'That file is empty. Nothing was imported.' };
  }

  if (raw.length > MAX_IMPORT_LENGTH) {
    return {
      ok: false,
      message: 'That file is too large to import safely. Nothing was imported.',
    };
  }

  const parsed = parseStoredWorkspace(raw);

  if (!parsed.ok) {
    return {
      ok: false,
      message: `That workspace file could not be imported. ${parsed.message} Nothing was changed.`,
    };
  }

  return parsed;
}
