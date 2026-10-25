import { Clock3, Flag, ListChecks } from 'lucide-react';
import { formatTaskDate, isOverdue } from '@/lib/date';
import { taskPriorityLabels } from '@/lib/eventMeta';
import type { TaskPriority } from '@/types/domain';
import { EmptyState } from './EmptyState';
import { StatusBadge } from './StatusBadge';

export interface TaskListItem {
  readonly id: string;
  readonly title: string;
  readonly dueDate: string;
  readonly priority: TaskPriority;
  readonly completed: boolean;
  readonly eventName?: string;
}

interface TaskListProps {
  readonly items: readonly TaskListItem[];
  readonly todayIso: string;
  readonly onToggle: (taskId: string) => void;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

const priorityTextClasses: Record<TaskPriority, string> = {
  low: 'text-ink-muted',
  medium: 'text-gold-700',
  high: 'text-rust-700',
};

export function TaskList({
  items,
  todayIso,
  onToggle,
  emptyTitle,
  emptyDescription,
}: TaskListProps) {
  if (items.length === 0) {
    return <EmptyState compact icon={ListChecks} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const overdue = !item.completed && isOverdue(item.dueDate, todayIso);
        const inputId = `task-${item.id}`;
        const descriptionId = `task-meta-${item.id}`;

        return (
          <li key={item.id} className="py-3.5 first:pt-0 last:pb-0">
            <div className="flex items-start gap-3">
              <input
                id={inputId}
                type="checkbox"
                checked={item.completed}
                onChange={() => onToggle(item.id)}
                aria-describedby={descriptionId}
                className="mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-maroon-800"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                  <label
                    htmlFor={inputId}
                    className={`cursor-pointer text-sm leading-relaxed font-semibold ${
                      item.completed ? 'text-ink-soft line-through' : 'text-ink'
                    }`}
                  >
                    {item.title}
                  </label>
                  {item.completed ? (
                    <StatusBadge tone="success">Completed</StatusBadge>
                  ) : overdue ? (
                    <StatusBadge tone="danger">Overdue</StatusBadge>
                  ) : null}
                </div>
                <p
                  id={descriptionId}
                  className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted"
                >
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
                    Due <time dateTime={item.dueDate}>{formatTaskDate(item.dueDate)}</time>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${priorityTextClasses[item.priority]}`}
                  >
                    <Flag className="size-3.5 shrink-0" aria-hidden="true" />
                    {taskPriorityLabels[item.priority]}
                  </span>
                  {item.eventName ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{item.eventName}</span>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
