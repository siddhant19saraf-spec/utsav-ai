import type { AiPlanMode } from './contracts';

export const aiModeLabels: Record<AiPlanMode, string> = {
  'create-plan': 'Create a plan',
  'revise-plan': 'Revise or adapt a plan',
  'answer-question': 'Answer a planning question',
  'summarize-risks': 'Summarize detected risks',
};

export const aiModeDescriptions: Record<AiPlanMode, string> = {
  'create-plan':
    'Draft an initial plan with a timeline, tasks, budget suggestions, catering assumptions, gaps, and trade-offs.',
  'revise-plan':
    'Adapt the saved plan when guests, budget, dates, or priorities change. The saved event is never edited automatically.',
  'answer-question':
    'Ask a practical planning question. The answer is advisory and cannot change saved records.',
  'summarize-risks':
    'Ask for a plain-language summary of the deterministic findings already recorded by Risk Intelligence.',
};

export const aiModePlaceholders: Record<AiPlanMode, string> = {
  'create-plan':
    'For example: Plan a college technical event for 200 people within ₹80,000.',
  'revise-plan':
    'For example: Our guest count increased from 100 to 140. What needs to change?',
  'answer-question':
    'For example: Which tasks must be completed first before the venue booking is confirmed?',
  'summarize-risks':
    'For example: Summarize the biggest risks for this event and explain which need attention first.',
};

export const aiModeExamples: Record<AiPlanMode, readonly string[]> = {
  'create-plan': [
    'Plan a college technical event for 200 people within ₹80,000.',
    'Suggest a birthday party plan for 30 guests.',
    'Draft a conference plan for 120 attendees with two tracks.',
  ],
  'revise-plan': [
    'Our guest count increased from 100 to 140. What needs to change?',
    'Suggest ways to reduce costs without changing the venue.',
    'The event moved a week earlier. What should be replanned first?',
  ],
  'answer-question': [
    'Which tasks must be completed first?',
    'What should we confirm with the caterer?',
    'Which parts of the plan are assumptions rather than confirmed facts?',
  ],
  'summarize-risks': [
    'Summarize the biggest risks for this event.',
    'Which detected risks affect the budget, and which affect the schedule?',
  ],
};
