import type { HazardCategory } from '../types/resident';
import { apiRequest } from './apiClient';

/** Status as returned for the reporter: the approved three, or raw in_progress / resolved. */
export type OwnReportStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'in_progress'
  | 'resolved';

export interface OwnReport {
  id: string;
  referenceCode: string;
  communityId: string;
  category: HazardCategory;
  description: string;
  latitude: number | null;
  longitude: number | null;
  status: OwnReportStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface NewReport {
  communityId: string;
  category: HazardCategory;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CurrentUser {
  id: string;
  role: 'resident' | 'admin';
  fullName: string | null;
  email: string | null;
  preferredCommunityId: string | null;
}

/** Submits a report. The server records it as pending; it is never shown publicly until verified. */
export function submitReport(report: NewReport): Promise<OwnReport> {
  return apiRequest<OwnReport>('/reports', {
    method: 'POST',
    requireAuth: true,
    body: report,
  });
}

export function listMyReports(): Promise<OwnReport[]> {
  return apiRequest<OwnReport[]>('/reports/mine', { requireAuth: true });
}

export function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/me', { requireAuth: true });
}

/** Saves (or clears with null) the signed-in user's own community. */
export function updatePreferredCommunity(
  preferredCommunityId: string | null,
): Promise<{ preferredCommunityId: string | null }> {
  return apiRequest<{ preferredCommunityId: string | null }>('/me', {
    method: 'PATCH',
    requireAuth: true,
    body: { preferredCommunityId },
  });
}
