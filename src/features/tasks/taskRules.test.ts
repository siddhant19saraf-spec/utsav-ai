import { describe, expect, it } from 'vitest';
import { makeEvent, makeTask } from '@/test/fixtures';
import {
  countOverdueTasks,
  defaultTaskDraft,
  filterTasksByPriority,
  filterTasksByStatus,
  isTaskOverdue,
  selectTaskProgress,
  sortTasksByDueDate,
  suggestPreparationTasks,
  suggestedDueDate,
  validateTaskDraft,
  type TaskDraft,
} from './taskRules';

const TODAY = '2026-10-24';

function makeDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: 'Book the photographer',
    description: '',
    dueDate: '2026-11-01',
    priority: 'high',
    assignee: '',
    ...overrides,
  };
}

describe('validateTaskDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateTaskDraft(makeDraft())).toEqual({});
  });

  it('requires a title and a real calendar due date', () => {
    expect(validateTaskDraft(makeDraft({ title: '   ' }))).toMatchObject({
      title: 'Enter a task title.',
    });
    expect(validateTaskDraft(makeDraft({ dueDate: '' }))).toMatchObject({
      dueDate: 'Choose a due date.',
    });
    expect(validateTaskDraft(makeDraft({ dueDate: '2026-02-30' }))).toMatchObject({
      dueDate: 'Enter a valid due date in YYYY-MM-DD form.',
    });
  });

  it('rejects overlong title, description, and assignee values', () => {
    const errors = validateTaskDraft(
      makeDraft({
        title: 'a'.repeat(161),
        description: 'a'.repeat(1_001),
        assignee: 'a'.repeat(81),
      }),
    );

    expect(Object.keys(errors).sort()).toEqual([
      'assignee',
      'description',
      'title',
    ]);
  });
});

describe('isTaskOverdue', () => {
  it('marks only open tasks with a past due date as overdue', () => {
    expect(
      isTaskOverdue(makeTask({ dueDate: '2026-10-23', status: 'open' }), TODAY),
    ).toBe(true);
    expect(
      isTaskOverdue(makeTask({ dueDate: TODAY, status: 'open' }), TODAY),
    ).toBe(false);
    expect(
      isTaskOverdue(
        makeTask({ dueDate: '2026-10-20', status: 'completed' }),
        TODAY,
      ),
    ).toBe(false);
  });

  it('counts overdue tasks', () => {
    expect(
      countOverdueTasks(
        [
          makeTask({ id: 'first', dueDate: '2026-10-01' }),
          makeTask({ id: 'second', dueDate: '2026-10-02' }),
          makeTask({ id: 'third', dueDate: '2026-11-02' }),
          makeTask({ id: 'fourth', dueDate: '2026-10-01', status: 'completed' }),
        ],
        TODAY,
      ),
    ).toBe(2);
  });
});

describe('sortTasksByDueDate', () => {
  it('orders tasks by due date while leaving the input untouched', () => {
    const input = [
      makeTask({ id: 'later', title: 'Later', dueDate: '2026-11-20' }),
      makeTask({ id: 'sooner', title: 'Sooner', dueDate: '2026-11-02' }),
    ];

    expect(sortTasksByDueDate(input).map((task) => task.id)).toEqual([
      'sooner',
      'later',
    ]);
    expect(input.map((task) => task.id)).toEqual(['later', 'sooner']);
  });
});

describe('task filters', () => {
  const openHigh = makeTask({ id: 'open-high', status: 'open', priority: 'high' });
  const openLow = makeTask({ id: 'open-low', status: 'open', priority: 'low' });
  const doneHigh = makeTask({
    id: 'done-high',
    status: 'completed',
    priority: 'high',
  });

  it('filters by status and priority', () => {
    expect(filterTasksByStatus([openHigh, doneHigh], 'open')).toEqual([openHigh]);
    expect(filterTasksByStatus([openHigh, doneHigh], 'all')).toHaveLength(2);
    expect(filterTasksByPriority([openHigh, openLow, doneHigh], 'high')).toEqual([
      openHigh,
      doneHigh,
    ]);
  });
});

describe('selectTaskProgress', () => {
  it('calculates completion without dividing by zero', () => {
    expect(selectTaskProgress([])).toEqual({
      total: 0,
      completed: 0,
      remaining: 0,
      percentage: 0,
    });

    expect(
      selectTaskProgress([
        makeTask({ id: 'one', status: 'completed' }),
        makeTask({ id: 'two', status: 'completed' }),
        makeTask({ id: 'three', status: 'open' }),
        makeTask({ id: 'four', status: 'open' }),
      ]),
    ).toEqual({ total: 4, completed: 2, remaining: 2, percentage: 50 });

    expect(
      selectTaskProgress([
        makeTask({ id: 'one', status: 'completed' }),
        makeTask({ id: 'two', status: 'open' }),
        makeTask({ id: 'three', status: 'open' }),
      ]).percentage,
    ).toBe(33);
  });
});

describe('suggestPreparationTasks', () => {
  it('derives due dates from the saved event date, not from today', () => {
    const event = makeEvent({ startsAt: '2026-12-01' });
    const suggestions = suggestPreparationTasks(event, TODAY);

    expect(suggestions.map((suggestion) => suggestion.dueDate)).toEqual([
      '2026-11-17',
      '2026-11-24',
      '2026-11-28',
    ]);
    expect(suggestions.every((suggestion) => suggestion.dueDate < event.startsAt)).toBe(
      true,
    );
  });

  it('drops suggestions whose due date has already passed', () => {
    const event = makeEvent({ startsAt: '2026-12-01' });
    const suggestions = suggestPreparationTasks(event, '2026-11-25');

    expect(suggestions.map((suggestion) => suggestion.key)).toEqual([
      'share-run-sheet',
    ]);
  });

  it('returns no suggestions for an event that has already started', () => {
    expect(
      suggestPreparationTasks(makeEvent({ startsAt: '2026-10-20' }), TODAY),
    ).toEqual([]);
  });

  it('never marks a suggestion completed', () => {
    const suggestions = suggestPreparationTasks(makeEvent({ startsAt: '2026-12-01' }), TODAY);

    expect(suggestions).toHaveLength(3);

    for (const suggestion of suggestions) {
      expect(suggestion).not.toHaveProperty('status');
      expect(suggestion).not.toHaveProperty('completed');
    }
  });
});

describe('suggestedDueDate and defaultTaskDraft', () => {
  it('prefers a week before the event when that date is still in the future', () => {
    const event = makeEvent({ startsAt: '2026-12-01' });

    expect(suggestedDueDate(event, TODAY)).toBe('2026-11-24');
    expect(defaultTaskDraft(event, TODAY)).toMatchObject({
      title: '',
      dueDate: '2026-11-24',
      priority: 'medium',
    });
  });

  it('falls back to the event date when the one-week mark has passed', () => {
    expect(
      suggestedDueDate(makeEvent({ startsAt: '2026-10-28' }), TODAY),
    ).toBe('2026-10-28');
  });

  it('uses today for a past event so the draft remains valid', () => {
    expect(
      suggestedDueDate(makeEvent({ startsAt: '2026-10-20' }), TODAY),
    ).toBe(TODAY);
  });
});
