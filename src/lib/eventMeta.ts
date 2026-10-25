import type { EventCategory, PlanningStatus, TaskPriority } from '@/types/domain';
import type { StatusTone } from '@/types/ui';

interface StatusDescriptor {
  readonly label: string;
  readonly tone: StatusTone;
}

export const eventCategoryLabels: Record<EventCategory, string> = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate',
  anniversary: 'Anniversary',
  festival: 'Festival',
  other: 'Other',
};

export const planningStatusMap: Record<PlanningStatus, StatusDescriptor> = {
  draft: { label: 'Draft', tone: 'neutral' },
  planning: { label: 'Planning', tone: 'info' },
  'on-track': { label: 'On track', tone: 'success' },
  'at-risk': { label: 'At risk', tone: 'danger' },
  completed: { label: 'Completed', tone: 'neutral' },
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  low: 'Low priority',
  medium: 'Medium priority',
  high: 'High priority',
};

export const taskPriorityTones: Record<TaskPriority, StatusTone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
};

export const eventCategories: readonly EventCategory[] = [
  'wedding',
  'birthday',
  'corporate',
  'anniversary',
  'festival',
  'other',
];

export const planningStatuses: readonly PlanningStatus[] = [
  'draft',
  'planning',
  'on-track',
  'at-risk',
  'completed',
];
