import { formatEventDate } from '@/lib/date';
import { formatCount } from '@/lib/format';
import type { CelebrationEvent, EventSetting } from '@/types/domain';
import type { RiskThresholds } from './riskConfig';
import type { RiskDetection } from './riskTypes';
import { detection, entity, evidence } from './riskDetectorSupport';

const settingLabels: Record<EventSetting, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  mixed: 'Mixed indoor and outdoor',
};

interface VenueContext {
  readonly event: CelebrationEvent;
  readonly daysUntilEvent: number | null;
  readonly withinNearWindow: boolean;
  readonly thresholds: RiskThresholds;
}

export function analyzeVenue(context: VenueContext): RiskDetection[] {
  const { event, daysUntilEvent, withinNearWindow, thresholds } = context;
  const detections: RiskDetection[] = [];

  if (daysUntilEvent === null) {
    return detections;
  }

  if (typeof event.setting === 'undefined') {
    if (withinNearWindow) {
      detections.push(
        detection(event, 'venue-contingency.setting-missing', {
          category: 'venue-contingency',
          severity: 'low',
          certainty: 'missing-data',
          title: 'Indoor or outdoor setting is not recorded',
          explanation:
            'Weather contingency cannot be assessed because the event setting is blank.',
          evidence: [
            evidence('Event date', formatEventDate(event.startsAt)),
            evidence('Setting', 'Not recorded'),
          ],
          recommendedAction:
            'Record whether the event is indoor, outdoor, or mixed in the event details. This does not create a venue change.',
          relatedEntities: [entity('event', event.id)],
          sourceModule: 'event-readiness',
        }),
      );
    }
  } else if (
    (event.setting === 'outdoor' || event.setting === 'mixed') &&
    event.contingencyPlanConfirmed !== true
  ) {
    detections.push(
      detection(event, 'venue-contingency.weather-contingency-missing', {
        category: 'venue-contingency',
        severity: withinNearWindow ? 'high' : 'medium',
        certainty:
          event.contingencyPlanConfirmed === false ? 'confirmed' : 'missing-data',
        title:
          event.contingencyPlanConfirmed === false
            ? 'Outdoor contingency plan is not confirmed'
            : 'Outdoor contingency plan is not recorded',
        explanation:
          'The event uses an outdoor or mixed setting, but no confirmed weather contingency exists. The app does not check weather forecasts or book a backup venue.',
        evidence: [
          evidence('Setting', settingLabels[event.setting]),
          evidence('Event date', formatEventDate(event.startsAt)),
          evidence(
            'Contingency plan',
            event.contingencyPlanConfirmed === false
              ? 'Recorded as not confirmed'
              : 'Not recorded',
          ),
        ],
        recommendedAction:
          'Confirm a wet-weather option with the venue and record the confirmation in the event details. Nothing was booked or changed.',
        relatedEntities: [entity('event', event.id)],
        sourceModule: 'event-readiness',
      }),
    );
  }

  if (
    event.accessibilityRequired === true &&
    event.accessibilityAddressed !== true
  ) {
    detections.push(
      detection(event, 'venue-contingency.accessibility-unaddressed', {
        category: 'venue-contingency',
        severity: withinNearWindow ? 'high' : 'medium',
        certainty:
          event.accessibilityAddressed === false ? 'confirmed' : 'missing-data',
        title: 'Accessibility is required but not recorded as addressed',
        explanation:
          'The event requires accessible arrangements, but there is no recorded confirmation that they are in place. The app cannot verify physical access or vendor compliance.',
        evidence: [
          evidence('Accessibility required', 'Yes'),
          evidence(
            'Accessibility addressed',
            event.accessibilityAddressed === false
              ? 'No'
              : 'Not recorded',
          ),
        ],
        recommendedAction:
          'Confirm step-free access, seating, and facilities with the venue, then mark accessibility as addressed when it is genuinely confirmed.',
        relatedEntities: [entity('event', event.id)],
        sourceModule: 'event-readiness',
      }),
    );
  }

  if (
    withinNearWindow &&
    typeof event.accessibilityRequired === 'undefined' &&
    event.expectedGuests >= thresholds.largeEventGuestCount
  ) {
    detections.push(
      detection(event, 'venue-contingency.accessibility-unknown', {
        category: 'venue-contingency',
        severity: 'low',
        certainty: 'missing-data',
        title: 'Accessibility needs are not recorded',
        explanation:
          'The event is near and relatively large, but it is not recorded whether accessibility arrangements are required.',
        evidence: [
          evidence('Expected guests', formatCount(event.expectedGuests)),
          evidence('Accessibility required', 'Not recorded'),
        ],
        recommendedAction:
          'Record whether accessibility is required in the event details, then confirm any needed arrangements with the venue.',
        relatedEntities: [entity('event', event.id)],
        sourceModule: 'event-readiness',
      }),
    );
  }

  if (
    withinNearWindow &&
    event.expectedGuests >= thresholds.largeEventGuestCount &&
    !event.venue?.trim()
  ) {
    detections.push(
      detection(event, 'venue-contingency.venue-missing', {
        category: 'venue-contingency',
        severity: 'medium',
        certainty: 'missing-data',
        title: 'Venue information is missing',
        explanation:
          'The event is near and relatively large, but no venue is recorded. Logistical planning cannot be checked.',
        evidence: [
          evidence('Event date', formatEventDate(event.startsAt)),
          evidence('Venue', 'Not recorded'),
          evidence('Expected guests', formatCount(event.expectedGuests)),
        ],
        recommendedAction:
          'Record the confirmed venue in the event details. This risk does not reserve or change a venue.',
        relatedEntities: [entity('event', event.id)],
        sourceModule: 'event-readiness',
      }),
    );
  }

  return detections;
}
