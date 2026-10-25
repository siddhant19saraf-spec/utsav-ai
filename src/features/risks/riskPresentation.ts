import {
  CalendarClock,
  FileWarning,
  MapPinned,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type {
  RiskCategory,
  RiskCertainty,
  RiskFindingStatus,
  RiskSeverity,
} from '@/types/risk';
import type { StatusTone } from '@/types/ui';

interface SeverityDescriptor {
  readonly label: string;
  readonly tone: StatusTone;
  readonly summary: string;
  readonly borderClass: string;
}

export const riskSeverityMeta: Record<RiskSeverity, SeverityDescriptor> = {
  critical: {
    label: 'Critical',
    tone: 'danger',
    summary: 'Needs attention before the event can proceed safely.',
    borderClass: 'border-l-rust-700',
  },
  high: {
    label: 'High',
    tone: 'danger',
    summary: 'Likely to affect the plan unless it is addressed soon.',
    borderClass: 'border-l-gold-600',
  },
  medium: {
    label: 'Medium',
    tone: 'warning',
    summary: 'Worth reviewing while there is still time to adjust.',
    borderClass: 'border-l-gold-400',
  },
  low: {
    label: 'Low',
    tone: 'neutral',
    summary: 'A minor or informational gap.',
    borderClass: 'border-l-slate-blue-100',
  },
};

export const riskSeverityOrder: readonly RiskSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
];

interface CategoryDescriptor {
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

export const riskCategoryMeta: Record<RiskCategory, CategoryDescriptor> = {
  financial: {
    label: 'Financial',
    shortLabel: 'Money',
    description: 'Budget totals, allocations, reserves, and catering cost assumptions.',
    icon: Wallet,
  },
  scheduling: {
    label: 'Schedule and preparation',
    shortLabel: 'Schedule',
    description: 'Overlaps, overdue work, tight preparation windows, and missing tasks.',
    icon: CalendarClock,
  },
  'guest-catering': {
    label: 'Guests and catering',
    shortLabel: 'Guests',
    description: 'RSVP gaps, attendance assumptions, accessibility needs, and catering cover.',
    icon: Users,
  },
  'venue-contingency': {
    label: 'Venue and contingency',
    shortLabel: 'Venue',
    description: 'Weather plans, venue details, and practical accessibility arrangements.',
    icon: MapPinned,
  },
  'proposal-consistency': {
    label: 'Rescue proposals',
    shortLabel: 'Proposals',
    description: 'Proposals evaluated against older event data or current protections.',
    icon: FileWarning,
  },
};

export const riskCategories: readonly RiskCategory[] = [
  'financial',
  'scheduling',
  'guest-catering',
  'venue-contingency',
  'proposal-consistency',
];

export const riskCertaintyLabels: Record<RiskCertainty, string> = {
  confirmed: 'Confirmed by saved data',
  potential: 'Potential issue',
  'missing-data': 'Missing information',
  assumption: 'Planning assumption',
};

export const riskStatusMeta: Record<
  RiskFindingStatus,
  { readonly label: string; readonly tone: StatusTone }
> = {
  open: { label: 'Open', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  dismissed: { label: 'Dismissed', tone: 'neutral' },
};

export const riskStatuses: readonly RiskFindingStatus[] = [
  'open',
  'resolved',
  'dismissed',
];
