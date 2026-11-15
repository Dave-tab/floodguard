import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { CommunityOverviewPage } from '../features/community/CommunityOverviewPage';
import { ExplorePage } from '../features/resident/ExplorePage';
import { ModulePlaceholderPage } from '../features/resident/ModulePlaceholderPage';

import AdminLayout from '../features/admin/AdminLayout';
import AdminDashboard from '../features/admin/AdminDashboard';
import AdminReportList from '../features/admin/AdminReportList';
import CommunityRiskView from '../features/admin/CommunityRiskView';
import EmergencyBroadcastForm from '../features/admin/EmergencyBroadcastForm';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public resident experience */}
        <Route path="/" element={<ExplorePage />} />
        <Route
          path="/communities/:communityId"
          element={<CommunityOverviewPage />}
        />

       <Route
  path="/hazard-map"
  element={
    <ModulePlaceholderPage
      title="Hazard map"
      subtitle="Explore reported hazards and community flood risk."
      description="Explore reported hazards and community flood risk."
      ownerLabel="Resident experience"
    />
  }
/>
<Route
  path="/report-hazard"
  element={
    <ModulePlaceholderPage
      title="Report a hazard"
      subtitle="Share a flood-related observation with your community."
      description="Share a flood-related observation with your community."
      ownerLabel="Resident experience"
    />
  }
/>
<Route
  path="/alerts"
  element={
    <ModulePlaceholderPage
      title="Alerts"
      subtitle="View important community safety notices."
      description="View important community safety notices."
      ownerLabel="Resident experience"
    />
  }
/>
<Route
  path="/my-activity"
  element={
    <ModulePlaceholderPage
      title="My activity"
      subtitle="Review your submitted reports and activity."
      description="Review your submitted reports and activity."
      ownerLabel="Resident experience"
    />
  }
/>
        {/* Admin frontend preview */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="reports" element={<AdminReportList />} />
          <Route path="communities" element={<CommunityRiskView />} />
          <Route path="broadcast" element={<EmergencyBroadcastForm />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}