import { ListPlus, Save } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { ModalDialog } from '@/components/ModalDialog';
import { formatEventDate } from '@/lib/date';
import type { CelebrationEvent, PlanningTask, TaskPriority } from '@/types/domain';
import {
  defaultTaskDraft,
  normalizeTaskDraft,
  validateTaskDraft,
  type TaskDraft,
  type TaskFormErrors,
  type TaskFormField,
} from './taskRules';

interface TaskDialogProps {
  readonly open: boolean;
  readonly event: CelebrationEvent;
  readonly task: PlanningTask | null;
  readonly todayIso: string;
  readonly onClose: () => void;
  readonly onSave: (draft: TaskDraft) => void;
}

const fieldOrder: readonly TaskFormField[] = [
  'title',
  'dueDate',
  'assignee',
  'description',
];

const priorityOptions: readonly { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function initialDraft(
  event: CelebrationEvent,
  task: PlanningTask | null,
  todayIso: string,
): TaskDraft {
  if (task) {
    return {
      title: task.title,
      description: task.description ?? '',
      dueDate: task.dueDate,
      priority: task.priority,
      assignee: task.assignee ?? '',
    };
  }

  return defaultTaskDraft(event, todayIso);
}

export function TaskDialog({
  open,
  event,
  task,
  todayIso,
  onClose,
  onSave,
}: TaskDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <TaskDialogContent
      key={task?.id ?? 'new'}
      event={event}
      task={task}
      todayIso={todayIso}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function TaskDialogContent({
  event,
  task,
  todayIso,
  onClose,
  onSave,
}: Omit<TaskDialogProps, 'open'>) {
  const [values, setValues] = useState<TaskDraft>(() =>
    initialDraft(event, task, todayIso),
  );
  const [errors, setErrors] = useState<TaskFormErrors>({});
  const [errorSummary, setErrorSummary] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  const fieldIds: Record<TaskFormField, string> = {
    title: 'task-title',
    dueDate: 'task-due-date',
    assignee: 'task-assignee',
    description: 'task-description',
  };

  function updateField<K extends keyof TaskDraft>(field: K, value: TaskDraft[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!(field in current)) {
        return current;
      }

      const next = { ...current };
      delete next[field as TaskFormField];
      return next;
    });
    setErrorSummary('');
  }

  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();

    if (submittedRef.current) {
      return;
    }

    const draft = normalizeTaskDraft(values);
    const nextErrors = validateTaskDraft(draft);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setErrorSummary('Please fix the highlighted fields before saving the task.');
      const firstInvalid = fieldOrder.find((field) => nextErrors[field]);

      if (firstInvalid) {
        document.getElementById(fieldIds[firstInvalid])?.focus();
      }

      return;
    }

    submittedRef.current = true;
    setErrors({});
    setErrorSummary('');
    onSave(draft);
  }

  return (
    <ModalDialog
      open
      eyebrow={task ? 'Edit task' : 'New task'}
      title={task ? 'Update this task' : 'Add a preparation task'}
      description={`${event.name} · ${formatEventDate(event.startsAt)}. Due dates use the event’s local calendar date.`}
      onClose={onClose}
      initialFocusRef={titleRef}
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-5 px-5 py-6 sm:px-7">
        {errorSummary ? (
          <div
            role="alert"
            className="rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3 text-sm font-medium text-rust-700"
          >
            {errorSummary}
          </div>
        ) : null}

        <div>
          <label htmlFor={fieldIds.title} className="field-label">
            Task title
          </label>
          <input
            ref={titleRef}
            id={fieldIds.title}
            name="title"
            type="text"
            value={values.title}
            maxLength={160}
            onChange={(changeEvent) => updateField('title', changeEvent.target.value)}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? 'task-title-error' : undefined}
            autoComplete="off"
            placeholder="Confirm the final headcount"
            className={`field-control mt-1.5 ${errors.title ? 'border-rust-600' : ''}`}
          />
          {errors.title ? (
            <p id="task-title-error" className="field-error mt-1.5">
              {errors.title}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={fieldIds.dueDate} className="field-label">
              Due date
            </label>
            <input
              id={fieldIds.dueDate}
              name="dueDate"
              type="date"
              value={values.dueDate}
              onChange={(changeEvent) => updateField('dueDate', changeEvent.target.value)}
              aria-invalid={errors.dueDate ? true : undefined}
              aria-describedby={errors.dueDate ? 'task-due-error' : undefined}
              className={`field-control mt-1.5 ${errors.dueDate ? 'border-rust-600' : ''}`}
            />
            {errors.dueDate ? (
              <p id="task-due-error" className="field-error mt-1.5">
                {errors.dueDate}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="task-priority" className="field-label">
              Priority
            </label>
            <select
              id="task-priority"
              name="priority"
              value={values.priority}
              onChange={(changeEvent) =>
                updateField(
                  'priority',
                  changeEvent.target.value === 'low' ||
                    changeEvent.target.value === 'high'
                    ? changeEvent.target.value
                    : 'medium',
                )
              }
              className="field-control mt-1.5"
            >
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={fieldIds.assignee} className="field-label">
            Assigned person <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input
            id={fieldIds.assignee}
            name="assignee"
            type="text"
            value={values.assignee}
            maxLength={80}
            onChange={(changeEvent) => updateField('assignee', changeEvent.target.value)}
            aria-invalid={errors.assignee ? true : undefined}
            aria-describedby={errors.assignee ? 'task-assignee-error' : undefined}
            autoComplete="off"
            placeholder="A name or role, not contact details"
            className={`field-control mt-1.5 ${errors.assignee ? 'border-rust-600' : ''}`}
          />
          {errors.assignee ? (
            <p id="task-assignee-error" className="field-error mt-1.5">
              {errors.assignee}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={fieldIds.description} className="field-label">
            Description <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <textarea
            id={fieldIds.description}
            name="description"
            rows={3}
            value={values.description}
            maxLength={1_000}
            onChange={(changeEvent) => updateField('description', changeEvent.target.value)}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? 'task-description-error' : undefined}
            className={`field-control mt-1.5 resize-y ${errors.description ? 'border-rust-600' : ''}`}
          />
          {errors.description ? (
            <p id="task-description-error" className="field-error mt-1.5">
              {errors.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {task ? (
              <Save className="size-4" aria-hidden="true" />
            ) : (
              <ListPlus className="size-4" aria-hidden="true" />
            )}
            {task ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
