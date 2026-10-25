import { formatMoney } from '@/lib/money';
import type { BudgetFlexibility } from '@/types/budget';
import type { EventSetting } from '@/types/domain';
import type { StatusTone } from '@/types/ui';
import type {
  RescueArea,
  RescueCertainty,
  RescueChangeKind,
  RescueSeverity,
} from './rescueTypes';

export function rescueSettingLabel(
  value: EventSetting | null | undefined,
): string {
  switch (value) {
    case 'indoor':
      return 'Indoor';
    case 'outdoor':
      return 'Outdoor';
    case 'mixed':
      return 'Indoor and outdoor';
    default:
      return 'Not recorded';
  }
}

export function rescueThemeLabel(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : 'Not recorded';
}

export function rescueFlexibilityLabel(
  flexibility: BudgetFlexibility,
): string {
  return flexibility.mode === 'protected'
    ? 'Protected'
    : `Flexible · minimum ${formatMoney(flexibility.minimumPlanned)}`;
}

export const rescueSeverityLabels: Record<RescueSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Information',
};

export const rescueSeverityTones: Record<RescueSeverity, StatusTone> = {
  critical: 'danger',
  warning: 'warning',
  info: 'info',
};

export const rescueCertaintyLabels: Record<RescueCertainty, string> = {
  confirmed: 'Confirmed',
  potential: 'Potential risk',
  'missing-data': 'Missing information',
  assumption: 'Planning assumption',
};

export const rescueCertaintyTones: Record<RescueCertainty, StatusTone> = {
  confirmed: 'neutral',
  potential: 'warning',
  'missing-data': 'info',
  assumption: 'warning',
};

export const rescueAreaLabels: Record<RescueArea, string> = {
  budget: 'Budget',
  guests: 'Guests',
  catering: 'Catering',
  tasks: 'Tasks',
  schedule: 'Schedule',
  weather: 'Weather',
  accessibility: 'Accessibility',
  priority: 'Protected priorities',
  requirements: 'Requirements',
};

export const rescueChangeKindLabels: Record<RescueChangeKind, string> = {
  'total-budget': 'Budget',
  'guest-count': 'Guests',
  'event-date': 'Date',
  setting: 'Setting',
  theme: 'Theme',
  accessibility: 'Accessibility',
  contingency: 'Contingency',
  'category-planned': 'Allocation',
  'category-protection': 'Protection',
  'category-minimum': 'Minimum',
};
