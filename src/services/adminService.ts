import type { HazardCategory } from '../types/resident';
import { apiRequest } from './apiClient';

/**
 * Admin operations through the FloodGuard API. The API checks that the signed-in user's
 * profile role is ADMIN; nothing here relies on the browser for authorisation.
 */

/** Approved statuses plus the raw in_progress / resolved values the database can hold. */
export type AdminReportStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'in_progress'
  | 'resolved';

/** The four approved severities (no "moderate"). */
export type AssessmentRiskLevel = 'low' | 'high' | 'severe' | 'critical';

export type AlertSeverity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

export type AlertType =
  | 'flood_warning'
  | 'weather_notice'
  | 'safety_advisory'
  | 'community_notice'
  | 'other';

export interface AdminReport {
  id: string;
  referenceCode: string;
  communityId: string;
  communityName: string;
  state: string;
  lga: string;
  category: HazardCategory;
  dbCategory: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  status: AdminReportStatus;
  photoPath: string | null;
  adminNote: string | null;
  reporterId: string;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AdminCommunityRisk {
  communityId: string;
  communityName: string;
  state: string;
  lga: string;
  latitude: number | null;
  longitude: number | null;
  status: 'available' | 'insufficient_data' | 'unavailable';
  level: AssessmentRiskLevel | null;
  score: number | null;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
  summary: string | null;
  assessedAt: string | null;
  validUntil: string | null;
  missingInputs: string[];
}

export interface AdminSummary {
  activeCommunities: number;
  elevatedAssessments: number;
  totalReports: number | null;
  pendingReports: number | null;
  verifiedReports: number | null;
  recentReports: AdminReport[];
  recentAssessments: AdminCommunityRisk[];
}

export interface PublicAlert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  alertType: AlertType;
  communityId: string | null;
  communityName: string | null;
  issuedAt: string;
  expiresAt: string | null;
  source: string;
}

export interface NewAlert {
  title: string;
  message: string;
  severity: AlertSeverity;
  alertType: AlertType;
  communityId: string | null;
  expiresAt: string | null;
}

export function getAdminSummary(): Promise<AdminSummary> {
  return apiRequest<AdminSummary>('/admin/summary', { requireAuth: true });
}

export function listAdminReports(): Promise<AdminReport[]> {
  return apiRequest<AdminReport[]>('/admin/reports', { requireAuth: true });
}

export function reviewReport(
  reportId: string,
  decision: 'verified' | 'rejected',
  reviewNote: string | null,
): Promise<AdminReport> {
  return apiRequest<AdminReport>(
    `/admin/reports/${encodeURIComponent(reportId)}/review`,
    {
      method: 'POST',
      requireAuth: true,
      body: { decision, reviewNote: reviewNote?.trim() ? reviewNote.trim() : null },
    },
  );
}

export function listAdminCommunities(): Promise<AdminCommunityRisk[]> {
  return apiRequest<AdminCommunityRisk[]>('/admin/communities', {
    requireAuth: true,
  });
}

export function reassessCommunity(communityId: string): Promise<unknown> {
  return apiRequest<unknown>(
    `/admin/assess/${encodeURIComponent(communityId)}`,
    { method: 'POST', requireAuth: true },
  );
}

export function publishAlert(alert: NewAlert): Promise<PublicAlert> {
  return apiRequest<PublicAlert>('/admin/alerts', {
    method: 'POST',
    requireAuth: true,
    body: alert,
  });
}

/** Unexpired alerts (public endpoint). */
export function listActiveAlerts(communityId?: string): Promise<PublicAlert[]> {
  const query = communityId
    ? `?communityId=${encodeURIComponent(communityId)}`
    : '';
  return apiRequest<PublicAlert[]>(`/alerts${query}`);
}
