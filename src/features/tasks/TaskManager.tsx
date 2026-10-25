import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ListPlus,
  Pencil,
  Trash2,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { formatTaskDate } from '@/lib/date';
import type {
  CelebrationEvent,
  PlanningTask,
  TaskPriority,
} from '@/types/domain';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { TaskDialog } from './TaskDialog';
import {
  countOverdueTasks,
  filterTasksByPriority,
  filterTasksByStatus,
  isTaskOverdue,
  selectTaskProgress,
  sortTasksByDueDate,
  suggestPreparationTasks,
  type TaskPriorityFilter,
  type TaskStatusFilter,
} from './taskRules';

interface TaskManagerProps {
  readonly event: CelebrationEvent;
  readonly todayIso: string;
}

const statusFilters: readonly { value: TaskStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
];

const priorityFilters: readonly { value: TaskPriorityFilter; label: string }[] = [
  { value: 'all', label: 'Any priority' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const priorityLabels: Record<TaskPriority, string> = {
  low: 'Low priority',
  medium: 'Medium priority',
  high: 'High priority',
};

function priorityTone(priority: TaskPriority) {
  return priority === 'high' ? 'danger' : priority === 'medium' ? 'warning' : 'neutral';
}

export function TaskManager({ event, todayIso }: TaskManagerProps) {
  const { workspace, createTask, updateTask, deleteTask, toggleTask } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriorityFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlanningTask | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const eventTasks = sortTasksByDueDate(
    workspace.tasks.filter((task) => task.eventId === event.id),
  );
  const visibleTasks = filterTasksByPriority(
    filterTasksByStatus(eventTasks, statusFilter),
    priorityFilter,
  );
  const progress = selectTaskProgress(eventTasks);
  const overdueCount = countOverdueTasks(eventTasks, todayIso);
  const suggestions = suggestPreparationTasks(event, todayIso);
  const existingTitles = new Set(
    eventTasks.map((task) => task.title.trim().toLowerCase()),
  );

  function openCreateDialog() {
    setEditingTask(null);
    setDialogOpen(true);
  }

  function openEditDialog(task: PlanningTask) {
    setEditingTask(task);
    setDialogOpen(true);
    setPendingDeleteId(null);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingTask(null);
  }

  function handleSave(draft: Parameters<typeof createTask>[1]) {
    if (editingTask) {
      updateTask(editingTask.id, draft);
      setAnnouncement(`Updated “${draft.title}”.`);
    } else {
      createTask(event.id, draft);
      setAnnouncement(`Added “${draft.title}” to ${event.name}.`);
    }

    closeDialog();
  }

  function handleToggle(task: PlanningTask) {
    toggleTask(task.id);
    setAnnouncement(
      `${task.status === 'open' ? 'Completed' : 'Reopened'} “${task.title}”.`,
    );
  }

  function handleDelete(task: PlanningTask) {
    deleteTask(event.id, task.id);
    setPendingDeleteId(null);
    setAnnouncement(`Deleted “${task.title}”. This change is saved in this browser.`);
  }

  function handleAddSuggestion(
    suggestion: (typeof suggestions)[number],
  ) {
    if (existingTitles.has(suggestion.title.toLowerCase())) {
      return;
    }

    createTask(event.id, {
      title: suggestion.title,
      description: suggestion.description,
      dueDate: suggestion.dueDate,
      priority: suggestion.priority,
      assignee: '',
    });
    setAnnouncement(`Added the suggested task “${suggestion.title}”.`);
  }

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="task-manager-heading">
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="eyebrow">Task management</p>
          <h2
            id="task-manager-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            Preparation tasks
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-ink-muted">
            Tasks belong only to {event.name}. Open tasks past their due date are marked
            overdue using today’s local date.
          </p>
        </div>
        <button type="button" onClick={openCreateDialog} className="btn-primary shrink-0">
          <ListPlus className="size-4" aria-hidden="true" />
          Add task
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface-muted/60 px-4 py-3">
          <p className="text-xs font-semibold text-ink-muted">Completion</p>
          <p className="mt-1 text-lg font-semibold text-ink tabular-nums">
            {progress.completed} of {progress.total} tasks
          </p>
          <div
            role="progressbar"
            aria-label={`Task completion for ${event.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percentage}
            aria-valuetext={`${progress.completed} of ${progress.total} tasks complete, ${progress.percentage}%`}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full rounded-full bg-sage-600"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted/60 px-4 py-3">
          <p className="text-xs font-semibold text-ink-muted">Open tasks</p>
          <p className="mt-1 text-lg font-semibold text-ink tabular-nums">
            {progress.remaining}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {progress.percentage}% complete
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted/60 px-4 py-3">
          <p className="text-xs font-semibold text-ink-muted">Overdue</p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              overdueCount > 0 ? 'text-rust-700' : 'text-ink'
            }`}
          >
            {overdueCount}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {overdueCount === 0 ? 'Nothing past due' : 'Open tasks past the due date'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-surface-muted/40 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter tasks by status" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-ink-muted">Status</span>
          {statusFilters.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              aria-pressed={statusFilter === option.value}
              className={`min-h-8 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === option.value
                  ? 'bg-maroon-800 text-white'
                  : 'border border-line-strong bg-surface text-ink-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="sm:w-44">
          <label htmlFor="task-priority-filter" className="sr-only">
            Filter tasks by priority
          </label>
          <select
            id="task-priority-filter"
            value={priorityFilter}
            onChange={(changeEvent) =>
              setPriorityFilter(
                changeEvent.target.value === 'high' ||
                  changeEvent.target.value === 'medium' ||
                  changeEvent.target.value === 'low'
                  ? changeEvent.target.value
                  : 'all',
              )
            }
            className="field-control min-h-9 py-1.5 text-xs"
          >
            {priorityFilters.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        {visibleTasks.length === 0 ? (
          <EmptyState
            compact
            icon={ClipboardList}
            title={
              eventTasks.length === 0
                ? 'No tasks for this event yet'
                : 'No tasks match these filters'
            }
            description={
              eventTasks.length === 0
                ? 'Add real preparation work with a due date. Suggested tasks below are derived from the event date and are not saved until you add them.'
                : 'Try a different status or priority. Completed tasks remain available for review.'
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {visibleTasks.map((task) => {
              const overdue = isTaskOverdue(task, todayIso);
              const checkboxId = `task-manager-${task.id}`;

              return (
                <li key={task.id} className="py-4 first:pt-1 last:pb-1">
                  <div className="flex items-start gap-3">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={task.status === 'completed'}
                      onChange={() => handleToggle(task)}
                      className="mt-1 size-5 shrink-0 cursor-pointer rounded accent-maroon-800"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                        <label
                          htmlFor={checkboxId}
                          className={`cursor-pointer text-sm leading-relaxed font-semibold ${
                            task.status === 'completed'
                              ? 'text-ink-soft line-through'
                              : 'text-ink'
                          }`}
                        >
                          {task.title}
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge tone={priorityTone(task.priority)}>
                            {priorityLabels[task.priority]}
                          </StatusBadge>
                          {task.status === 'completed' ? (
                            <StatusBadge tone="success">Completed</StatusBadge>
                          ) : overdue ? (
                            <StatusBadge tone="danger">Overdue</StatusBadge>
                          ) : (
                            <StatusBadge tone="info">Open</StatusBadge>
                          )}
                        </div>
                      </div>

                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
                          Due{' '}
                          <time dateTime={task.dueDate}>{formatTaskDate(task.dueDate)}</time>
                        </span>
                        {task.assignee ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <User className="size-3.5 shrink-0" aria-hidden="true" />
                              {task.assignee}
                            </span>
                          </>
                        ) : null}
                      </p>

                      {task.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                          {task.description}
                        </p>
                      ) : null}

                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditDialog(task)}
                          className="btn-ghost min-h-8 px-2.5 py-1 text-xs"
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingDeleteId(
                              pendingDeleteId === task.id ? null : task.id,
                            )
                          }
                          className="btn-ghost min-h-8 px-2.5 py-1 text-xs text-rust-700 hover:bg-rust-50"
                          aria-expanded={pendingDeleteId === task.id}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          Delete
                        </button>
                      </div>

                      {pendingDeleteId === task.id ? (
                        <div
                          role="group"
                          aria-label={`Confirm deletion of ${task.title}`}
                          className="mt-2.5 rounded-2xl border border-rust-100 bg-rust-50 px-3.5 py-3"
                        >
                          <p className="flex items-start gap-2 text-xs leading-relaxed text-rust-700">
                            <AlertTriangle
                              className="mt-0.5 size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            Delete “{task.title}”? This removes the task from this browser
                            and cannot be undone.
                          </p>
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleDelete(task)}
                              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-rust-700 px-3 py-1 text-xs font-semibold text-white hover:bg-rust-600"
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                              Confirm delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(null)}
                              className="inline-flex min-h-8 items-center rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-semibold text-ink"
                            >
                              Keep task
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {suggestions.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-gold-200 bg-gold-50/60 p-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-gold-700"
              aria-hidden="true"
            />
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Suggested preparation tasks
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                Derived from the saved event date ({formatTaskDate(event.startsAt)}). These
                are suggestions only and are not saved or completed until you add them.
              </p>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-gold-200/70">
            {suggestions.map((suggestion) => {
              const alreadyAdded = existingTitles.has(suggestion.title.toLowerCase());

              return (
                <li
                  key={suggestion.key}
                  className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{suggestion.title}</p>
                    <p className="text-xs text-ink-muted">
                      Due {formatTaskDate(suggestion.dueDate)} ·{' '}
                      {priorityLabels[suggestion.priority]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddSuggestion(suggestion)}
                    disabled={alreadyAdded}
                    className="btn-secondary min-h-8 shrink-0 px-3 py-1 text-xs"
                  >
                    {alreadyAdded ? 'Already added' : 'Add suggestion'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <TaskDialog
        open={dialogOpen}
        event={event}
        task={editingTask}
        todayIso={todayIso}
        onClose={closeDialog}
        onSave={handleSave}
      />
    </section>
  );
}
