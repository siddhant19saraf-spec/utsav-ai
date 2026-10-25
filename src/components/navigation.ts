import {
  CalendarDays,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavigationItem {
  readonly label: string;
  readonly to: string;
  readonly icon: LucideIcon;
  readonly end: boolean;
}

export interface NavigationSection {
  readonly title: string;
  readonly items: readonly NavigationItem[];
}

export const navigationSections: readonly NavigationSection[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'Overview', to: '/', icon: LayoutDashboard, end: true },
      { label: 'My Events', to: '/events', icon: CalendarDays, end: false },
      { label: 'Budget Planner', to: '/budget', icon: Wallet, end: false },
      { label: 'Event Rescue', to: '/rescue', icon: LifeBuoy, end: false },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Timeline', to: '/timeline', icon: ListChecks, end: false },
      { label: 'Guests', to: '/guests', icon: Users, end: false },
      { label: 'Risk Intelligence', to: '/risks', icon: ShieldAlert, end: false },
      { label: 'AI Planner', to: '/assistant', icon: Sparkles, end: false },
    ],
  },
];

export const settingsNavigationItem: NavigationItem = {
  label: 'Settings',
  to: '/settings',
  icon: Settings,
  end: false,
};

export const allNavigationItems: readonly NavigationItem[] = [
  ...navigationSections.flatMap((section) => section.items),
  settingsNavigationItem,
];
