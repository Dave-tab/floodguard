
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { CommunityOverviewPage } from '../features/community/CommunityOverviewPage';
import { ExplorePage } from '../features/resident/ExplorePage';
import { HazardMapPage } from '../features/resident/HazardMapPage';
import { ReportHazardPage } from '../features/resident/ReportHazardPage';
import { AuthPage } from '../features/auth/AuthPage';
import { AdminRoute } from '../features/auth/AdminRoute';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { AlertsPage } from '../features/resident/AlertsPage';
import { MyActivityPage } from '../features/resident/MyActivityPage';
import { UserDashboardPage } from '../features/resident/UserDashboardPage';

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

        {/* Resident routes */}
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

        {/* Resident reporting: anyone can fill the form; sending it requires sign-in */}
        <Route path="/report-hazard" element={<ReportHazardPage />} />

        {/* Public alerts */}
        <Route path="/alerts" element={<AlertsPage />} />

        {/* Signed-in resident dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <UserDashboardPage />
            </ProtectedRoute>
          }
        />

        {/* Resident activity */}
        <Route
          path="/my-activity"
          element={
            <ProtectedRoute>
              <MyActivityPage />
            </ProtectedRoute>
          }
        />

        {/* Admin (role checked here for the interface and by the API on every request) */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="reports" element={<AdminReportList />} />
          <Route path="communities" element={<CommunityRiskView />} />
          <Route path="broadcast" element={<EmergencyBroadcastForm />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
