import {
  calculateCateringEstimate,
  type CateringEstimate,
} from '@/features/catering/cateringEstimator';
import { getGuestCounts } from '@/features/guests/guestRules';
import { isValidIsoDate } from '@/lib/date';
import type { CelebrationEvent } from '@/types/domain';
import { resolveRiskThresholds, type RiskThresholds } from './riskConfig';
import { analyzeBudget } from './riskBudgetDetector';
import { analyzeGuests } from './riskGuestDetector';
import { analyzeProposals } from './riskProposalDetector';
import { analyzeScheduling } from './riskSchedulingDetector';
import { analyzeVenue } from './riskVenueDetector';
import { analysisError, daysBetween } from './riskDetectorSupport';
import type {
  RiskAnalysisError,
  RiskAnalysisInput,
  RiskAnalysisResult,
  RiskDetection,
} from './riskTypes';

interface EventAnalysis {
  readonly detections: readonly RiskDetection[];
  readonly errors: readonly RiskAnalysisError[];
}

function analyzeEvent(
  event: CelebrationEvent,
  workspace: RiskAnalysisInput['workspace'],
  todayIso: string,
  thresholds: RiskThresholds,
): EventAnalysis {
  const detections: RiskDetection[] = [];
  const errors: RiskAnalysisError[] = [];
  const tasks = workspace.tasks.filter((task) => task.eventId === event.id);
  const guests = workspace.guests.filter((guest) => guest.eventId === event.id);
  const activities = workspace.activities.filter(
    (activity) => activity.eventId === event.id,
  );
  const estimateConfig =
    workspace.cateringEstimates.find((entry) => entry.eventId === event.id) ?? null;
  const budget = analyzeBudget(event, thresholds);

  detections.push(...budget.detections);
  errors.push(...budget.errors);

  const dateIsValid = isValidIsoDate(event.startsAt);
  const daysUntilEvent = dateIsValid
    ? daysBetween(todayIso, event.startsAt)
    : null;

  if (!dateIsValid) {
    errors.push(
      analysisError(
        event,
        'scheduling.invalid-event-date',
        'The saved event date could not be interpreted; date-based checks were skipped.',
      ),
    );
  }

  const withinNearWindow =
    daysUntilEvent !== null &&
    daysUntilEvent >= 0 &&
    daysUntilEvent <= thresholds.nearEventDays;
  const withinCriticalWindow =
    daysUntilEvent !== null &&
    daysUntilEvent >= 0 &&
    daysUntilEvent <= thresholds.criticalWindowDays;

  if (dateIsValid) {
    detections.push(
      ...analyzeScheduling({
        event,
        tasks,
        activities,
        todayIso,
        daysUntilEvent,
        withinNearWindow,
        withinCriticalWindow,
        thresholds,
      }),
    );
  }

  detections.push(
    ...analyzeVenue({
      event,
      daysUntilEvent,
      withinNearWindow,
      thresholds,
    }),
  );

  const counts = getGuestCounts(guests);
  let estimate: CateringEstimate | null = null;
  let estimateInvalid = false;

  if (estimateConfig) {
    try {
      estimate = calculateCateringEstimate(
        event,
        guests,
        estimateConfig.perPersonCost,
        estimateConfig.bufferPercent,
      );
    } catch {
      estimateInvalid = true;
      errors.push(
        analysisError(
          event,
          'guest-catering.catering-estimate-invalid',
          'The saved catering estimate could not be evaluated safely; catering checks were limited.',
        ),
      );
    }
  }

  detections.push(
    ...analyzeGuests({
      event,
      guests,
      counts,
      estimate,
      estimateConfigured: estimateConfig !== null,
      estimateInvalid,
      withinNearWindow,
      thresholds,
    }),
  );

  detections.push(
    ...analyzeProposals({
      event,
      tasks,
      guests,
      activities,
      estimate: estimateConfig,
      withinCriticalWindow,
      snapshots: workspace.rescueProposalSnapshots ?? [],
    }),
  );

  return { detections, errors };
}

/**
 * Deterministic, read-only risk analysis. The saved workspace is never
 * mutated; the caller reconciles the returned detections into stored findings.
 */
export function analyzeWorkspaceRisks(input: RiskAnalysisInput): RiskAnalysisResult {
  if (!isValidIsoDate(input.todayIso)) {
    throw new RangeError('Risk analysis needs a valid local date in YYYY-MM-DD form.');
  }

  const thresholds = resolveRiskThresholds(input.thresholds);
  const detections: RiskDetection[] = [];
  const errors: RiskAnalysisError[] = [];
  const analyzedEventIds: string[] = [];

  for (const event of input.workspace.events) {
    if (event.status === 'completed') {
      continue;
    }

    analyzedEventIds.push(event.id);
    const result = analyzeEvent(event, input.workspace, input.todayIso, thresholds);
    detections.push(...result.detections);
    errors.push(...result.errors);
  }

  return {
    detections,
    errors,
    analyzedEventIds,
    thresholds,
  };
}
