
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { CommunityOverviewPage } from '../features/community/CommunityOverviewPage';
import { ExplorePage } from '../features/resident/ExplorePage';
import { ModulePlaceholderPage } from '../features/resident/ModulePlaceholderPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* FE1: Public resident experience */}
        <Route path="/" element={<ExplorePage />} />

        <Route
          path="/communities/:communityId"
          element={<CommunityOverviewPage />}
        />

        {/* FE2: Hazard map */}
        <Route
          path="/hazard-map"
          element={
            <ModulePlaceholderPage
              subtitle="Hazard Map"
              title="Interactive Verified Hazard Map"
              description="The interactive hazard map and verified incident filtering workflow will be available here."
              ownerLabel="FE2 Integration Point"
            />
          }
        />

        {/* FE2: Hazard reporting */}
        <Route
          path="/report-hazard"
          element={
            <ModulePlaceholderPage
              subtitle="Report Hazard"
              title="Resident Hazard Reporting"
              description="This area is reserved for authenticated residents to submit hazard reports for administrative review."
              ownerLabel="FE2 Integration Point"
            />
          }
        />

        {/* Team integration: Alerts */}
        <Route
          path="/alerts"
          element={
            <ModulePlaceholderPage
              subtitle="Alerts"
              title="Community Alerts and Notices"
              description="This area is reserved for weather information and authorised community notices."
              ownerLabel="Team Integration Point"
            />
          }
        />

        {/* Team integration: Resident activity */}
        <Route
          path="/my-activity"
          element={
            <ModulePlaceholderPage
              subtitle="Activity"
              title="Resident Activity"
              description="This area is reserved for authenticated resident account access and private report tracking."
              ownerLabel="Team Integration Point"
            />
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
