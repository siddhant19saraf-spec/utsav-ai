import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { NotFoundPage } from './NotFoundPage';

const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);

const EventsPage = lazy(() =>
  import('@/features/events/EventsPage').then((module) => ({
    default: module.EventsPage,
  })),
);

const BudgetPlannerPage = lazy(() =>
  import('@/features/budget/BudgetPlannerPage').then((module) => ({
    default: module.BudgetPlannerPage,
  })),
);

const EventRescuePage = lazy(() =>
  import('@/features/rescue/EventRescuePage').then((module) => ({
    default: module.EventRescuePage,
  })),
);

const TimelinePage = lazy(() =>
  import('@/features/timeline/TimelinePage').then((module) => ({
    default: module.TimelinePage,
  })),
);

const GuestsPage = lazy(() =>
  import('@/features/guests/GuestsPage').then((module) => ({
    default: module.GuestsPage,
  })),
);

const RiskIntelligencePage = lazy(() =>
  import('@/features/risks/RiskIntelligencePage').then((module) => ({
    default: module.RiskIntelligencePage,
  })),
);

const AiPlanningPage = lazy(() =>
  import('@/features/ai/AiPlanningPage').then((module) => ({
    default: module.AiPlanningPage,
  })),
);

const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  })),
);

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="budget" element={<BudgetPlannerPage />} />
        <Route path="rescue" element={<EventRescuePage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="guests" element={<GuestsPage />} />
        <Route path="risks" element={<RiskIntelligencePage />} />
        <Route path="assistant" element={<AiPlanningPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
