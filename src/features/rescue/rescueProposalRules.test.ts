import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import { makeBudget, makeCategory, makeEvent } from '@/test/fixtures';
import { analyzeEventRescue } from './rescueEngine';
import { isApprovableProposal } from './rescueProposalRules';
import {
  createRescueRequestFromForm,
  getInitialRescueForm,
} from './rescueForm';

const TODAY = '2026-10-24';

function analyzeScenario() {
  const event = makeEvent({
    id: 'wedding',
    name: 'Wedding',
    startsAt: '2026-12-01',
    expectedGuests: 100,
    budget: makeBudget({
      eventId: 'wedding',
      totalAvailable: rupees(10_000),
      categories: [
        makeCategory({
          id: 'venue',
          name: 'Venue',
          planned: rupees(6_000),
          flexibility: { mode: 'protected' },
        }),
        makeCategory({
          id: 'catering',
          name: 'Catering',
          planned: rupees(2_000),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(1_500) },
        }),
        makeCategory({
          id: 'decor',
          name: 'Décor',
          planned: rupees(3_000),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(2_000) },
        }),
      ],
    }),
  });
  const built = createRescueRequestFromForm(
    event,
    getInitialRescueForm(event),
    TODAY,
  );

  if (!built.ok) {
    throw new Error('The rescue test fixture must produce a valid request.');
  }

  const result = analyzeEventRescue({
    event,
    tasks: [],
    activities: [],
    guests: [],
    cateringEstimate: null,
    request: built.request,
    todayIso: TODAY,
  });
  const proposal = result.proposal;

  if (!proposal) {
    throw new Error('The over-budget fixture must produce a repair proposal.');
  }

  return { result, proposal };
}

describe('isApprovableProposal', () => {
  it('accepts a feasible proposal that passed validation and changes something', () => {
    const { result, proposal } = analyzeScenario();

    expect(result.feasible).toBe(true);
    expect(proposal.changes.length).toBeGreaterThan(0);
    expect(proposal.validation.isValid).toBe(true);
    expect(isApprovableProposal(proposal, result.feasible)).toBe(true);
  });

  it('rejects an infeasible analysis even when the proposal object is present', () => {
    const { proposal } = analyzeScenario();

    expect(isApprovableProposal(proposal, false)).toBe(false);
  });

  it('rejects a missing proposal or one that failed validation', () => {
    const { result, proposal } = analyzeScenario();
    const invalidProposal = {
      ...proposal,
      validation: { ...proposal.validation, isValid: false },
    };

    expect(isApprovableProposal(null, true)).toBe(false);
    expect(isApprovableProposal(invalidProposal, result.feasible)).toBe(false);
  });

  it('rejects a feasible proposal with no changes to apply', () => {
    const { result, proposal } = analyzeScenario();

    expect(
      isApprovableProposal({ ...proposal, changes: [] }, result.feasible),
    ).toBe(false);
  });
});
