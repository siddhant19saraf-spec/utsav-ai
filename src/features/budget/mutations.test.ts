import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import { makeBudget, makeCategory } from '@/test/fixtures';
import { EMERGENCY_RESERVE_CATEGORY_ID } from './budgetConstants';
import {
  createEventBudget,
  withEmergencyReserve,
  withRemovedCategory,
  withReplacedCategories,
  withUpdatedBudgetTotal,
  withUpsertedCategory,
} from './mutations';

describe('createEventBudget', () => {
  it('starts an isolated, empty budget with no invented figures', () => {
    const budget = createEventBudget(
      'event-1',
      'budget-1',
      rupees(5_000),
      '2026-10-24T00:00:00.000Z',
    );

    expect(budget).toEqual({
      id: 'budget-1',
      eventId: 'event-1',
      totalAvailable: rupees(5_000),
      categories: [],
      emergencyReserve: { enabled: false, target: rupees(0) },
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    });
  });
});

describe('withUpdatedBudgetTotal', () => {
  it('changes only the total and update timestamp', () => {
    const venue = makeCategory({ id: 'venue' });
    const budget = makeBudget({ categories: [venue] });
    const next = withUpdatedBudgetTotal(
      budget,
      rupees(2_000),
      '2026-10-25T00:00:00.000Z',
    );

    expect(next.totalAvailable).toEqual(rupees(2_000));
    expect(next.updatedAt).toBe('2026-10-25T00:00:00.000Z');
    expect(next.categories).toBe(budget.categories);
    expect(next.createdAt).toBe(budget.createdAt);
    expect(budget.totalAvailable).toEqual(rupees(1_000));
  });
});

describe('withUpsertedCategory', () => {
  it('appends a new category without touching existing allocations', () => {
    const venue = makeCategory({ id: 'venue', planned: rupees(600) });
    const catering = makeCategory({ id: 'catering', name: 'Catering', planned: rupees(300) });
    const budget = makeBudget({ categories: [venue] });
    const next = withUpsertedCategory(budget, catering, '2026-10-25T00:00:00.000Z');

    expect(next.categories).toEqual([venue, catering]);
    expect(next.categories[0]).toBe(venue);
    expect(next.updatedAt).toBe('2026-10-25T00:00:00.000Z');
    expect(budget.categories).toEqual([venue]);
  });

  it('replaces a matching category in place and leaves siblings intact', () => {
    const venue = makeCategory({ id: 'venue', planned: rupees(600) });
    const catering = makeCategory({ id: 'catering', name: 'Catering', planned: rupees(300) });
    const updatedVenue = makeCategory({ id: 'venue', planned: rupees(550) });
    const budget = makeBudget({ categories: [venue, catering] });
    const next = withUpsertedCategory(budget, updatedVenue, '2026-10-25T00:00:00.000Z');

    expect(next.categories).toEqual([updatedVenue, catering]);
    expect(next.categories[1]).toBe(catering);
    expect(budget.categories).toEqual([venue, catering]);
  });
});

describe('withRemovedCategory', () => {
  it('removes only the requested category', () => {
    const venue = makeCategory({ id: 'venue' });
    const catering = makeCategory({ id: 'catering', name: 'Catering' });
    const budget = makeBudget({ categories: [venue, catering] });
    const next = withRemovedCategory(budget, 'venue', '2026-10-25T00:00:00.000Z');

    expect(next.categories).toEqual([catering]);
    expect(next.updatedAt).toBe('2026-10-25T00:00:00.000Z');
    expect(budget.categories).toEqual([venue, catering]);
  });

  it('ignores an unknown category identifier without removing anything', () => {
    const venue = makeCategory({ id: 'venue' });
    const budget = makeBudget({ categories: [venue] });
    const next = withRemovedCategory(budget, 'missing', '2026-10-25T00:00:00.000Z');

    expect(next.categories).toEqual([venue]);
  });
});

describe('withReplacedCategories', () => {
  it('replaces the full allocation list without mutating the source budget', () => {
    const original = makeCategory({ id: 'original' });
    const replacement = makeCategory({ id: 'replacement', planned: rupees(900) });
    const budget = makeBudget({ categories: [original] });
    const next = withReplacedCategories(
      budget,
      [replacement],
      '2026-10-25T00:00:00.000Z',
    );

    expect(next.categories).toEqual([replacement]);
    expect(next.totalAvailable).toEqual(budget.totalAvailable);
    expect(budget.categories).toEqual([original]);
  });
});

describe('withEmergencyReserve', () => {
  it('adds the reserve as a protected category when enabled', () => {
    const venue = makeCategory({ id: 'venue', planned: rupees(700) });
    const budget = makeBudget({ categories: [venue] });
    const next = withEmergencyReserve(
      budget,
      { enabled: true, target: rupees(100) },
      '2026-10-25T00:00:00.000Z',
    );

    expect(next.emergencyReserve).toEqual({ enabled: true, target: rupees(100) });
    expect(next.categories).toHaveLength(2);
    expect(next.categories[1]).toEqual({
      id: EMERGENCY_RESERVE_CATEGORY_ID,
      name: 'Emergency reserve',
      planned: rupees(100),
      actual: rupees(0),
      flexibility: { mode: 'protected' },
    });
    expect(budget.categories).toEqual([venue]);
  });

  it('updates an existing reserve allocation while keeping its actual and notes', () => {
    const reserve = makeCategory({
      id: EMERGENCY_RESERVE_CATEGORY_ID,
      name: 'Emergency reserve',
      planned: rupees(100),
      actual: rupees(25),
      flexibility: { mode: 'protected' },
      notes: 'Ring-fenced',
    });
    const budget = makeBudget({
      categories: [reserve],
      emergencyReserve: { enabled: true, target: rupees(100) },
    });
    const next = withEmergencyReserve(
      budget,
      { enabled: true, target: rupees(250) },
      '2026-10-25T00:00:00.000Z',
    );

    expect(next.categories).toHaveLength(1);
    expect(next.categories[0]).toEqual({
      ...reserve,
      planned: rupees(250),
    });
  });

  it('removes the reserve category when disabled', () => {
    const venue = makeCategory({ id: 'venue' });
    const reserve = makeCategory({
      id: EMERGENCY_RESERVE_CATEGORY_ID,
      flexibility: { mode: 'protected' },
    });
    const budget = makeBudget({
      categories: [venue, reserve],
      emergencyReserve: { enabled: true, target: rupees(100) },
    });
    const next = withEmergencyReserve(
      budget,
      { enabled: false, target: rupees(100) },
      '2026-10-25T00:00:00.000Z',
    );

    expect(next.categories).toEqual([venue]);
    expect(next.emergencyReserve).toEqual({ enabled: false, target: rupees(100) });
  });
});
