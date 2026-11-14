
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { CommunityOverviewPage } from '../features/community/CommunityOverviewPage';
import { ExplorePage } from '../features/resident/ExplorePage';
import { HazardMapPage } from '../features/resident/HazardMapPage';
import { ReportHazardPage } from '../features/resident/ReportHazardPage';
import { AuthPage } from '../features/auth/AuthPage';
import { AlertsPage } from '../features/resident/AlertsPage';
import { MyActivityPage } from '../features/resident/MyActivityPage';

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

        <Route path="/hazard-map" element={<HazardMapPage />} />

        {/* Authentication */}
        <Route
          path="/login"
          element={<AuthPage initialMode="login" />}
        />

        <Route
          path="/register"
          element={<AuthPage initialMode="register" />}
        />

        {/* Temporary public access for frontend development */}
        <Route
          path="/report-hazard"
          element={<ReportHazardPage />}
        />

        {/* Public alerts */}
        <Route path="/alerts" element={<AlertsPage />} />

        {/* Temporary public access to preview My Activity */}
        <Route
          path="/my-activity"
          element={<MyActivityPage />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
