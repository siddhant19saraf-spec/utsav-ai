import { selectTopOpenFindings } from '@/features/risks/riskSelectors';
import { suggestPreparationTasks } from '@/features/tasks/taskRules';
import { calculateCateringEstimate } from '@/features/catering/cateringEstimator';
import { formatEventDate, toIsoDate } from '@/lib/date';
import { formatMoney } from '@/lib/money';
import { stableHash } from '@/lib/stableHash';
import type { Workspace } from '@/types/domain';
import {
  aiPlanEnvelopeSchema,
  type AiPlan,
  type AiPlanEnvelope,
  type AiPlanRequest,
  type AiGap,
} from './contracts';

export type LocalFallbackResult =
  | { readonly ok: true; readonly envelope: AiPlanEnvelope }
  | { readonly ok: false; readonly message: string };

function clip(value: string, maxLength: number): string {
  const trimmed = value.trim();

  return trimmed.length <= maxLength
    ? trimmed
    : `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function money(amountMinor: number): string {
  return formatMoney({ amountMinor, currency: 'INR' });
}

/**
 * Deterministic outline used when no AI provider is configured or a provider
 * request fails. It repeats saved facts and existing rule-based suggestions;
 * it never fabricates an AI answer, a vendor price, or a schedule.
 */
export function buildLocalFallbackPlan(
  request: AiPlanRequest,
  workspace: Workspace,
  now: Date,
): LocalFallbackResult {
  const todayIso = toIsoDate(now);
  const event = request.event
    ? workspace.events.find((entry) => entry.id === request.event?.id) ?? null
    : null;
  const gaps: AiGap[] = [];
  const assumptions: string[] = [
    'This outline was produced by local deterministic rules, not by an AI model.',
    'No vendor was contacted and no booking, live price, availability, weather, or permit was checked.',
    'Budget figures are advisory only and are never applied by this page.',
    'Preparation tasks come from the app’s rule-based suggestions and require your explicit approval.',
  ];

  let overview: string;

  if (!event) {
    overview =
      'AI planning is unavailable and no saved event is selected. The local outline cannot create an event-specific plan without saved facts. Create or select an event, or configure the server-side AI provider and try again.';
    gaps.push({
      title: 'No saved event selected',
      detail:
        'The deterministic fallback can only summarize and organize data that already exists in this workspace. It does not invent an event, budget, or schedule.',
      question: null,
    });
  } else {
    const budget = event.budget.totalAvailable.amountMinor;
    const planned = event.budget.categories.reduce(
      (total, category) => total + category.planned.amountMinor,
      0,
    );
    const openRisks = selectTopOpenFindings(
      (workspace.riskFindings ?? []).filter(
        (finding) => finding.eventId === event.id,
      ),
      20,
    );

    if (request.mode === 'summarize-risks') {
      overview = `AI risk summarization is unavailable. Risk Intelligence currently records ${
        openRisks.length
      } open deterministic ${
        openRisks.length === 1 ? 'finding' : 'findings'
      } for “${event.name}”. These are the saved findings, shown without AI rewriting or new severity calculations.`;
    } else if (request.mode === 'answer-question') {
      overview = `AI planning is unavailable, so the app cannot answer the free-form question “${clip(
        request.message,
        300,
      )}”. This deterministic outline instead summarizes the saved plan for “${
        event.name
      }” on ${formatEventDate(event.startsAt)} and lists rule-based preparation tasks. It does not generate new advice.`;
      gaps.push({
        title: 'Natural-language answer unavailable',
        detail:
          'The local fallback does not interpret questions or create recommendations. Configure the server-side AI provider to receive an answer to this question.',
        question: null,
      });
    } else {
      overview = `AI planning is unavailable. This deterministic outline summarizes “${
        event.name
      }” on ${formatEventDate(event.startsAt)}: a saved budget of ${money(
        budget,
      )}, ${money(planned)} planned across ${
        event.budget.categories.length
      } ${event.budget.categories.length === 1 ? 'category' : 'categories'}, and ${
        event.expectedGuests
      } expected guests. It repeats rule-based preparation tasks from the app but does not invent a new plan, timeline, or cost.`;
    }

    if (event.budget.totalAvailable.amountMinor === 0) {
      gaps.push({
        title: 'No total budget saved',
        detail:
          'The event has no total available budget, so allocation and over-budget checks cannot run. Set a total in the Budget Planner.',
        question: null,
      });
    }

    if (!event.venue?.trim()) {
      gaps.push({
        title: 'Venue is not recorded',
        detail:
          'No venue is saved for this event. Venue-dependent advice requires a confirmed location.',
        question: null,
      });
    }

    const guestCount = workspace.guests.filter(
      (guest) => guest.eventId === event.id,
    ).length;

    if (guestCount === 0) {
      gaps.push({
        title: 'No guest records',
        detail:
          'No invited guests are saved. Attendance and catering checks currently rely on the event’s expected guest count.',
        question: null,
      });
    }

    if (event.accessibilityRequired && !event.accessibilityAddressed) {
      gaps.push({
        title: 'Accessibility needs are recorded but not addressed',
        detail:
          'The event records an accessibility requirement that is not marked as addressed. Confirm the practical arrangements.',
        question: null,
      });
    }

    if (event.contingencyPlanConfirmed === false) {
      gaps.push({
        title: 'Contingency plan is not confirmed',
        detail:
          'The event has a saved contingency flag that is not confirmed. Review the backup plan for the venue and setting.',
        question: null,
      });
    }

    const savedCatering = workspace.cateringEstimates.find(
      (estimate) => estimate.eventId === event.id,
    );

    if (!savedCatering) {
      gaps.push({
        title: 'No catering assumption',
        detail:
          'No per-person catering assumption is saved, so the app cannot calculate an estimate. Add one in Guests if you need a planning figure.',
        question: null,
      });
    }

    if (request.mode !== 'summarize-risks') {
      const hasTimeline = workspace.activities.some(
        (activity) => activity.eventId === event.id,
      );

      if (!hasTimeline) {
        gaps.push({
          title: 'Timeline is empty',
          detail:
            'No activities are saved for this event. The local fallback does not invent a programme; add real start and end times in the Timeline.',
          question: null,
        });
      }
    }
  }

  const openFindings = event
    ? selectTopOpenFindings(
        (workspace.riskFindings ?? []).filter(
          (finding) => finding.eventId === event.id,
        ),
        20,
      )
    : [];
  const riskSummary =
    openFindings.length > 0
      ? {
          overview: `The app currently records ${openFindings.length} open deterministic ${
            openFindings.length === 1 ? 'finding' : 'findings'
          }. Severities and evidence come from Risk Intelligence, not this outline.`,
          items: openFindings.map((finding) => ({
            findingId: finding.id,
            summary: clip(
              `${finding.title}. ${finding.explanation} ${finding.recommendedAction}`,
              1_000,
            ),
          })),
        }
      : null;

  const existingTaskTitles = new Set(
    event
      ? workspace.tasks
          .filter((task) => task.eventId === event.id)
          .map((task) => task.title.trim().toLowerCase())
      : [],
  );
  const tasks =
    event && request.mode !== 'summarize-risks'
      ? suggestPreparationTasks(event, todayIso)
          .filter(
            (suggestion) =>
              !existingTaskTitles.has(suggestion.title.toLowerCase()),
          )
          .map((suggestion) => ({
            title: suggestion.title,
            description: suggestion.description,
            dueDate: suggestion.dueDate,
            priority: suggestion.priority,
            milestone: false,
          }))
      : [];

  const savedCatering = event
    ? workspace.cateringEstimates.find(
        (estimate) => estimate.eventId === event.id,
      )
    : undefined;
  const savedCateringEstimate =
    event && savedCatering
      ? (() => {
          try {
            return calculateCateringEstimate(
              event,
              workspace.guests,
              savedCatering.perPersonCost,
              savedCatering.bufferPercent,
            );
          } catch {
            return null;
          }
        })()
      : null;
  const catering =
    request.mode === 'summarize-risks' || !savedCateringEstimate
      ? null
      : {
          recommendedAttendeeCount: savedCateringEstimate.baseAttendees,
          perPersonCostMinor: savedCateringEstimate.perPersonCost.amountMinor,
          bufferPercent: savedCateringEstimate.bufferPercent,
          notes: [
            'This repeats the saved catering assumption for reference; it is not a new recommendation.',
            `The saved estimate uses ${
              savedCateringEstimate.attendeeSource === 'confirmed'
                ? 'confirmed RSVPs'
                : 'the event’s expected guest count'
            }.`,
            'The app calculator, not an AI model, determines the estimate shown in the catering panel.',
          ],
        };

  const plan: AiPlan = {
    overview: clip(overview, 4_000),
    assumptions: assumptions.map((entry) => clip(entry, 500)),
    timeline: [],
    budgetCategories: [],
    tasks: tasks.slice(0, 40).map((task) => ({
      title: clip(task.title, 160),
      description: clip(task.description, 1_000),
      dueDate: task.dueDate,
      priority: task.priority,
      milestone: task.milestone,
    })),
    catering,
    gaps: gaps.slice(0, 20).map((gap) => ({
      title: clip(gap.title, 160),
      detail: clip(gap.detail, 1_000),
      question: gap.question === null ? null : clip(gap.question, 300),
    })),
    alternatives: [],
    tradeOffs: [
      'The local fallback cannot suggest creative alternatives, new timelines, or natural-language answers.',
      'Configuring the server-side AI provider enables those suggestions, but every proposal still requires deterministic validation and your approval.',
    ].map((entry) => clip(entry, 600)),
    riskSummary,
  };

  const signature = stableHash(
    JSON.stringify({
      request,
      eventId: event?.id ?? null,
      openRiskIds: openFindings.map((finding) => finding.id),
      taskTitles: tasks.map((task) => task.title),
      generatedFor: todayIso,
    }),
  );
  const envelope: AiPlanEnvelope = {
    requestId: `local-${signature}`,
    generatedAt: now.toISOString(),
    source: 'local-fallback',
    provider: {
      name: 'Local deterministic rules',
      model: 'app-rules',
    },
    plan,
  };
  const parsed = aiPlanEnvelopeSchema.safeParse(envelope);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        'The local deterministic outline could not be assembled safely. No data was changed. Review the event’s saved values and try again.',
    };
  }

  return { ok: true, envelope: parsed.data };
}
