import type { CateringEstimate } from '@/features/catering/cateringEstimator';
import type { GuestCounts } from '@/features/guests/guestRules';
import { formatCount } from '@/lib/format';
import type { CelebrationEvent, Guest } from '@/types/domain';
import type { RiskCertainty } from '@/types/risk';
import type { RiskThresholds } from './riskConfig';
import type { RiskDetection } from './riskTypes';
import {
  detection,
  entity,
  evidence,
  formatInr,
  percent,
  relatedIds,
} from './riskDetectorSupport';

interface GuestContext {
  readonly event: CelebrationEvent;
  readonly guests: readonly Guest[];
  readonly counts: GuestCounts;
  readonly estimate: CateringEstimate | null;
  readonly estimateConfigured: boolean;
  readonly estimateInvalid: boolean;
  readonly withinNearWindow: boolean;
  readonly thresholds: RiskThresholds;
}

export function analyzeGuests(context: GuestContext): RiskDetection[] {
  const {
    event,
    guests,
    counts,
    estimate,
    estimateConfigured,
    estimateInvalid,
    withinNearWindow,
    thresholds,
  } = context;
  const detections: RiskDetection[] = [];
  const expectedGuests = event.expectedGuests;
  const canCompareGuests =
    Number.isSafeInteger(expectedGuests) && expectedGuests > 0;

  if (!canCompareGuests) {
    return detections;
  }

  if (counts.invited === 0) {
    if (expectedGuests >= thresholds.largeEventGuestCount) {
      detections.push(
        detection(event, 'guest-catering.guest-list-missing', {
          category: 'guest-catering',
          severity: 'low',
          certainty: 'missing-data',
          title: 'Guest list and RSVPs are not recorded',
          explanation:
            'This event expects a relatively large number of guests, but no guest records exist. Attendance, dietary needs, and accessibility requests cannot be assessed.',
          evidence: [
            evidence('Expected guests', formatCount(expectedGuests)),
            evidence('Guest records', '0'),
          ],
          recommendedAction:
            'Add guest records and record RSVPs in the Guest Manager. Expected guests remain a planning estimate, not a confirmed headcount.',
          relatedEntities: [entity('event', event.id)],
          sourceModule: 'guest-rules',
        }),
      );
    }
  } else {
    const pendingThreshold = Math.max(
      thresholds.pendingRsvpMinimumCount,
      Math.ceil((counts.invited * thresholds.pendingRsvpHighPercent) / 100),
    );

    if (counts.pending >= pendingThreshold && counts.pending > 0) {
      const pendingPercent = percent(counts.pending, counts.invited);

      detections.push(
        detection(event, 'guest-catering.rsvp-incomplete', {
          category: 'guest-catering',
          severity: withinNearWindow ? 'high' : 'medium',
          certainty: 'confirmed',
          title: 'RSVP information is incomplete',
          explanation:
            'A material share of invited guests have not responded. Pending guests are not confirmed attendees and make catering and seating plans uncertain.',
          evidence: [
            evidence('Invited guests', formatCount(counts.invited)),
            evidence('Pending RSVPs', formatCount(counts.pending)),
            evidence('Confirmed guests', formatCount(counts.confirmed)),
            evidence('Pending share', `${pendingPercent}%`),
            evidence('Threshold applied', `${formatCount(pendingThreshold)} pending guests`),
          ],
          recommendedAction:
            'Follow up with pending guests in the Guest Manager. Do not count pending RSVPs as confirmed attendance.',
          relatedEntities: [
            entity('event', event.id),
            ...relatedIds(
              'guest',
              guests
                .filter((guest) => guest.rsvp === 'pending')
                .map((guest) => guest.id),
            ),
          ],
          sourceModule: 'guest-rules',
        }),
      );
    }

    const difference = Math.abs(counts.confirmed - expectedGuests);
    const deviationThreshold = Math.max(
      thresholds.attendanceDeviationMinimumCount,
      Math.ceil((expectedGuests * thresholds.attendanceDeviationPercent) / 100),
    );

    if (difference >= deviationThreshold) {
      const aboveExpected = counts.confirmed > expectedGuests;
      const certainty: RiskCertainty =
        aboveExpected || counts.pending === 0 ? 'confirmed' : 'potential';

      detections.push(
        detection(event, 'guest-catering.attendance-deviation', {
          category: 'guest-catering',
          severity: aboveExpected ? 'high' : 'medium',
          certainty,
          title: aboveExpected
            ? 'Confirmed attendance exceeds the planning count'
            : 'Confirmed attendance is below the planning count',
          explanation: aboveExpected
            ? 'Confirmed RSVPs are higher than the expected guest count used for planning. Catering and space allocations may be too low.'
            : 'Confirmed RSVPs are materially below the expected guest count. Pending replies may still change the final number, but current confirmations do not match the plan.',
          evidence: [
            evidence('Expected guests', formatCount(expectedGuests)),
            evidence('Confirmed guests', formatCount(counts.confirmed)),
            evidence('Pending guests', formatCount(counts.pending)),
            evidence('Difference', formatCount(difference)),
            evidence('Materiality threshold', `${formatCount(deviationThreshold)} guests`),
          ],
          recommendedAction:
            'Reconcile the expected count with confirmed RSVPs in the Guest Manager. Update the event’s expected count only as an explicit planning decision.',
          relatedEntities: [entity('event', event.id)],
          sourceModule: 'guest-rules',
        }),
      );
    }
  }

  if (estimateConfigured && estimateInvalid) {
    detections.push(
      detection(event, 'guest-catering.catering-estimate-invalid', {
        category: 'guest-catering',
        severity: 'high',
        certainty: 'confirmed',
        title: 'The saved catering estimate cannot be evaluated',
        explanation:
          'The saved per-person cost assumption or buffer cannot be used for a safe estimate. Catering coverage cannot be verified.',
        evidence: [
          evidence('Saved estimate', 'Present but unreadable'),
          evidence('Estimated cost', 'Not calculated'),
          evidence('Values invented', 'None'),
        ],
        recommendedAction:
          'Correct the per-person cost and buffer in the Guest Manager, then review the recalculated planning estimate. It is an assumption, not a vendor quote.',
        relatedEntities: [entity('event', event.id), entity('catering-estimate', event.id)],
        sourceModule: 'catering-estimator',
      }),
    );
  }

  if (!estimateConfigured) {
    if (withinNearWindow) {
      detections.push(
        detection(event, 'guest-catering.catering-estimate-missing', {
          category: 'guest-catering',
          severity: 'low',
          certainty: 'missing-data',
          title: 'No catering cost assumption is recorded',
          explanation:
            'The event is near, but no per-person catering assumption exists. Whether the catering allocation covers attendance cannot be checked.',
          evidence: [
            evidence('Expected guests', formatCount(expectedGuests)),
            evidence('Catering estimate', 'Not recorded'),
          ],
          recommendedAction:
            'Record a per-person cost assumption and buffer in the Guest Manager. It is a planning assumption, never a vendor price.',
          relatedEntities: [entity('event', event.id)],
          sourceModule: 'guest-rules',
        }),
      );
    }
  } else if (estimate) {
    if (
      estimate.differenceFromPlanMinor !== null &&
      estimate.differenceFromPlanMinor > 0
    ) {
      const plannedMinor = estimate.cateringCategory?.planned.amountMinor ?? 0;
      const overPercent = percent(estimate.differenceFromPlanMinor, plannedMinor);

      detections.push(
        detection(event, 'guest-catering.catering-over-plan', {
          category: 'guest-catering',
          severity:
            overPercent >= thresholds.cateringOverrunHighPercent ? 'high' : 'medium',
          certainty: 'assumption',
          title: 'Catering estimate exceeds its planned allocation',
          explanation:
            'Using the saved per-person assumption and buffer, the catering estimate is above the planned catering allocation. The estimate is a planning assumption, not a vendor quote.',
          evidence: [
            evidence('Estimated cost', formatInr(estimate.estimatedCost.amountMinor)),
            evidence(
              'Catering allocation',
              estimate.cateringCategory
                ? formatInr(plannedMinor)
                : 'No catering category',
            ),
            evidence(
              'Difference',
              formatInr(estimate.differenceFromPlanMinor),
            ),
            evidence(
              'Attendees used',
              `${formatCount(estimate.estimatedAttendees)} (${estimate.attendeeSource === 'confirmed' ? 'confirmed RSVPs' : 'expected guests'})`,
            ),
            evidence('Over-plan share', `${overPercent}%`),
          ],
          recommendedAction:
            'Review the catering plan and per-person assumption, then adjust the allocation or buffer in the app. No vendor price was inferred.',
          relatedEntities: [
            entity('event', event.id),
            entity('catering-estimate', event.id),
            ...(estimate.cateringCategory
              ? [entity('budget-category', estimate.cateringCategory.id)]
              : []),
          ],
          sourceModule: 'catering-estimator',
        }),
      );
    }

    if (estimate.estimatedAttendees < expectedGuests) {
      detections.push(
        detection(event, 'guest-catering.catering-below-expected', {
          category: 'guest-catering',
          severity: counts.pending === 0 ? 'high' : 'medium',
          certainty: counts.pending === 0 ? 'confirmed' : 'potential',
          title: 'Catering estimate covers fewer guests than planned',
          explanation:
            'The catering estimate is based on confirmed RSVPs plus its buffer, and covers fewer attendees than the event’s expected guest count.',
          evidence: [
            evidence('Estimated attendees', formatCount(estimate.estimatedAttendees)),
            evidence('Expected guests', formatCount(expectedGuests)),
            evidence('Confirmed guests', formatCount(estimate.counts.confirmed)),
            evidence('Pending guests', formatCount(estimate.counts.pending)),
            evidence('Buffer applied', `${estimate.bufferPercent}%`),
          ],
          recommendedAction:
            'Reconcile expected attendance or increase the buffer in the Guest Manager. Pending RSVPs must not be treated as confirmed.',
          relatedEntities: [
            entity('event', event.id),
            entity('catering-estimate', event.id),
          ],
          sourceModule: 'catering-estimator',
        }),
      );
    }
  }

  const accessibilityGuests = guests.filter(
    (guest) =>
      guest.rsvp === 'confirmed' && Boolean(guest.accessibilityRequest?.trim()),
  );

  if (
    accessibilityGuests.length > 0 &&
    event.accessibilityAddressed !== true
  ) {
    detections.push(
      detection(event, 'guest-catering.guest-accessibility', {
        category: 'guest-catering',
        severity: withinNearWindow ? 'high' : 'medium',
        certainty:
          event.accessibilityAddressed === false ? 'confirmed' : 'missing-data',
        title: 'Guest accessibility requests lack a recorded plan',
        explanation:
          'Confirmed guests have accessibility requests, but the event is not marked as having addressed accessibility. The app cannot verify venue access or vendor compliance.',
        evidence: [
          evidence('Confirmed guests with requests', formatCount(accessibilityGuests.length)),
          evidence(
            'Event accessibility status',
            event.accessibilityAddressed === false
              ? 'Recorded as not addressed'
              : 'Not recorded',
          ),
        ],
        recommendedAction:
          'Confirm each request with the venue and record the arrangements. Then mark accessibility as addressed in the event details when it is genuinely confirmed.',
        relatedEntities: [
          entity('event', event.id),
          ...relatedIds(
            'guest',
            accessibilityGuests.map((guest) => guest.id),
          ),
        ],
        sourceModule: 'event-readiness',
      }),
    );
  }

  return detections;
}
