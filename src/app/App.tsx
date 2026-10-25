import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { AiPlanningPage } from '@/features/ai/AiPlanningPage';
import { BudgetPlannerPage } from '@/features/budget/BudgetPlannerPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { EventsPage } from '@/features/events/EventsPage';
import { GuestsPage } from '@/features/guests/GuestsPage';
import { EventRescuePage } from '@/features/rescue/EventRescuePage';
import { RiskIntelligencePage } from '@/features/risks/RiskIntelligencePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TimelinePage } from '@/features/timeline/TimelinePage';
import { NotFoundPage } from './NotFoundPage';

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
