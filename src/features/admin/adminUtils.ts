import type { AdminReportStatus } from '../../services/adminService';
import type { HazardCategory } from '../../types/resident';

export const ADMIN_CATEGORY_LABELS: Record<HazardCategory, string> = {
  blocked_drainage: 'Blocked drainage',
  damaged_drainage: 'Damaged drainage',
  flooded_road: 'Flooded road',
  other: 'Other',
  overflowing_waterway: 'Overflowing waterway',
  rising_water_level: 'Rising water level',
};

/** in_progress / resolved are not approved statuses; shown only if the database holds them. */
export const ADMIN_STATUS_LABELS: Record<AdminReportStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
  in_progress: 'In progress (not an approved status)',
  resolved: 'Resolved (not an approved status)',
};

export function formatAdminDate(
  value: string | null,
  unavailableLabel = 'Date unavailable',
): string {
  if (!value) return unavailableLabel;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unavailableLabel;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function getAdminErrorMessage(
  error: unknown,
  fallback = 'An unexpected error occurred. Please try again.',
): string {
  return error instanceof Error ? error.message : fallback;
}
