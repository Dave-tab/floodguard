import { useCallback, useEffect, useMemo, useState } from 'react';

import type { HazardCategory } from '../../types/resident';
import {
  supabase,
  type AdminReportStatus,
  type CommunityPayload,
  type HazardReportPayload,
} from '../../services/supabaseClient';
import {
  AdminAlert,
  AdminLoadingState,
  AdminSectionHeader,
  AdminStatusBadge,
} from './AdminShared';
import {
  ADMIN_CATEGORY_LABELS,
  ADMIN_STATUS_LABELS,
  formatAdminDate,
  getAdminErrorMessage,
} from './adminUtils';

interface AdminReport extends HazardReportPayload {
  community_name: string;
}

type StatusFilter = 'all' | AdminReportStatus;
type CategoryFilter = 'all' | HazardCategory;
type ActionableStatus = Extract<AdminReportStatus, 'verified' | 'rejected'>;

const STATUS_OPTIONS: AdminReportStatus[] = [
  'pending',
  'verified',
  'rejected',
];

const TRANSITION_ACTION_LABELS: Record<ActionableStatus, string> = {
  verified: 'Verify',
  rejected: 'Reject',
};

const ALLOWED_TRANSITIONS: Record<AdminReportStatus, readonly ActionableStatus[]> = {
  pending: ['verified', 'rejected'],
  verified: [],
  rejected: [],
  in_progress: [],
  resolved: [],
};

const TRANSITION_BUTTON_STYLES: Record<ActionableStatus, string> = {
  verified:
    'rounded-xl bg-brand-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2',
  rejected:
    'rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2',
};

function getSafeImageUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch (error: unknown) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

export default function AdminReportList() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>('all');
  const [communityFilter, setCommunityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (!supabase) {
      setReports([]);
      setError(
        'Preview mode: connect the backend to load and review submitted community reports.',
      );
      setIsLoading(false);
      return;
    }

    try {
      const reportsResult = await supabase
        .from('hazard_reports')
        .select(
          'id, community_id, hazard_category, description, image_url, status, admin_notes, submitted_at',
        )
        .order('submitted_at', { ascending: false });

      if (reportsResult.error) {
        throw new Error(
          `Unable to load hazard reports: ${reportsResult.error.message}`,
        );
      }

      const reportRows = reportsResult.data ?? [];
      const communityIds = [
        ...new Set(reportRows.map((report) => report.community_id)),
      ];
      let communities: CommunityPayload[] = [];

      if (communityIds.length > 0) {
        const communitiesResult = await supabase
          .from('communities')
          .select(
            'id, community_name, state, lga, latitude, longitude, is_active',
          )
          .in('id', communityIds);

        if (communitiesResult.error) {
          throw new Error(
            `Unable to load report communities: ${communitiesResult.error.message}`,
          );
        }

        communities = communitiesResult.data ?? [];
      }

      const communityNames = new Map(
        communities.map((community) => [
          community.id,
          community.community_name,
        ]),
      );

      setReports(
        reportRows.map((report) => ({
          ...report,
          community_name:
            communityNames.get(report.community_id) ?? 'Community unavailable',
        })),
      );
    } catch (error: unknown) {
      setError(getAdminErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadReports);
  }, [loadReports]);

  const communities = useMemo(() => {
    const byId = new Map<string, string>();

    for (const report of reports) {
      byId.set(report.community_id, report.community_name);
    }

    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [reports]);

  const filteredReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          (categoryFilter === 'all' ||
            report.hazard_category === categoryFilter) &&
          (communityFilter === 'all' ||
            report.community_id === communityFilter) &&
          (statusFilter === 'all' || report.status === statusFilter),
      ),
    [reports, categoryFilter, communityFilter, statusFilter],
  );

  async function updateStatus(
    report: AdminReport,
    nextStatus: ActionableStatus,
  ): Promise<void> {
    setActionError(null);
    setBusyReportId(report.id);

    if (!supabase) {
     setActionError(
  'Preview mode: report status changes are unavailable until backend integration is complete.',
);
      setBusyReportId(null);
      return;
    }

    if (!ALLOWED_TRANSITIONS[report.status].includes(nextStatus)) {
      setActionError(
        `The transition from ${ADMIN_STATUS_LABELS[report.status]} to ${ADMIN_STATUS_LABELS[nextStatus]} is not allowed.`,
      );
      setBusyReportId(null);
      return;
    }

    try {
      const updateResult = await supabase
        .from('hazard_reports')
        .update({
          status: nextStatus,
          admin_notes: notes[report.id] ?? report.admin_notes,
        })
        .eq('id', report.id)
        .eq('status', report.status)
        .select('id')
        .maybeSingle();

      if (updateResult.error) {
        throw new Error(
          `The report could not be updated: ${updateResult.error.message}`,
        );
      }

      if (!updateResult.data) {
        throw new Error(
          'The report was not updated. Its status may have changed, or your account may not have permission.',
        );
      }

      await loadReports();
    } catch (error: unknown) {
      setActionError(getAdminErrorMessage(error));
    } finally {
      setBusyReportId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-border-soft bg-surface shadow-sm">
      <div className="border-b border-border-soft p-5 sm:p-7">
        <AdminSectionHeader
          description="Pending reports are unverified observations. Only permitted status transitions are offered; database policies must authorize each update."
          descriptionClassName="mt-2 max-w-3xl text-sm leading-6 text-text-secondary"
          eyebrow="Report verification"
          eyebrowClassName="text-xs font-bold uppercase tracking-[0.16em] text-brand-600"
          title="Community hazard reports"
          titleClassName="mt-2 text-2xl font-extrabold tracking-tight text-brand-950"
        />

        <div className="mt-6 grid gap-4 rounded-2xl border border-border-soft bg-canvas p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-bold uppercase tracking-wide text-brand-950">
            Hazard type{' '}
            <select
              className="mt-2 block w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-brand-950 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value as CategoryFilter)
              }
            >
              <option value="all">All hazard types</option>
              {Object.entries(ADMIN_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-brand-950">
            Community{' '}
            <select
              className="mt-2 block w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-brand-950 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              value={communityFilter}
              onChange={(event) => setCommunityFilter(event.target.value)}
            >
              <option value="all">All communities</option>
              {communities.map((community) => (
                <option key={community.id} value={community.id}>
                  {community.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-brand-950">
            Report status{' '}
            <select
              className="mt-2 block w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-brand-950 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {ADMIN_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {actionError && (
        <AdminAlert
          as="p"
          className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:mx-7"
        >
          {actionError}
        </AdminAlert>
      )}

      {isLoading && (
        <AdminLoadingState className="p-10 text-center text-sm text-text-secondary">
          Loading reports…
        </AdminLoadingState>
      )}

      {!isLoading && error && (
        <div className="p-8 text-center">
          <p className="text-sm text-red-800" role="alert">
            {error}
          </p>
          <button
            className="mt-5 inline-flex items-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2"
            onClick={() => void loadReports()}
            type="button"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && filteredReports.length === 0 && (
        <div className="p-10 text-center">
          <p className="font-bold text-brand-950">No reports found</p>
          <p className="mt-2 text-sm text-text-secondary">
            Try changing or clearing the filters.
          </p>
        </div>
      )}

      {!isLoading && !error && filteredReports.length > 0 && (
        <>
          <div className="grid gap-3 p-4 md:hidden">
            {filteredReports.map((report) => (
              <article
                className="space-y-4 rounded-2xl border border-border-soft bg-surface p-5 shadow-sm"
                key={report.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-brand-950">
                      {ADMIN_CATEGORY_LABELS[report.hazard_category]}
                    </h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      {report.community_name}
                    </p>
                  </div>
                  <AdminStatusBadge status={report.status} />
                </div>
                <ReportDetails
                  report={report}
                  note={notes[report.id] ?? report.admin_notes ?? ''}
                  onNoteChange={(value) =>
                    setNotes((current) => ({ ...current, [report.id]: value }))
                  }
                />
                <ReportActions
                  report={report}
                  busy={busyReportId === report.id}
                  onUpdate={updateStatus}
                />
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-border-soft">
              <thead className="bg-canvas">
                <tr>
                  <TableHeader>Reference</TableHeader>
                  <TableHeader>Community</TableHeader>
                  <TableHeader>Hazard</TableHeader>
                  <TableHeader>Description and notes</TableHeader>
                  <TableHeader>Submitted</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {filteredReports.map((report) => (
                  <tr
                    className="align-top transition-colors hover:bg-brand-50/40"
                    key={report.id}
                  >
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-text-secondary">
                      {report.id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-brand-950">
                      {report.community_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm font-bold text-brand-950">
                      {ADMIN_CATEGORY_LABELS[report.hazard_category]}
                    </td>
                    <td className="max-w-sm px-4 py-4">
                      <ReportDetails
                        report={report}
                        note={notes[report.id] ?? report.admin_notes ?? ''}
                        onNoteChange={(value) =>
                          setNotes((current) => ({
                            ...current,
                            [report.id]: value,
                          }))
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-text-secondary">
                      {formatAdminDate(report.submitted_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <AdminStatusBadge status={report.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <ReportActions
                        report={report}
                        busy={busyReportId === report.id}
                        onUpdate={updateStatus}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function ReportDetails({
  report,
  note,
  onNoteChange,
}: Readonly<{
  report: AdminReport;
  note: string;
  onNoteChange: (value: string) => void;
}>) {
  const imageUrl = getSafeImageUrl(report.image_url);

  return (
    <div className="space-y-3 rounded-2xl bg-canvas p-4">
      <details>
        <summary className="cursor-pointer text-sm font-bold text-brand-600 marker:text-brand-600">
          View report details
        </summary>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-brand-950">
          {report.description || 'No description provided.'}
        </p>
        <ReportImage imageUrl={imageUrl} originalUrl={report.image_url} />
      </details>

      <label className="block text-xs font-bold uppercase tracking-wide text-brand-950">
        Admin notes{' '}
        <textarea
          className="mt-2 block w-full rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-brand-950 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          rows={2}
        />
      </label>
    </div>
  );
}

function ReportActions({
  report,
  busy,
  onUpdate,
}: Readonly<{
  report: AdminReport;
  busy: boolean;
  onUpdate: (report: AdminReport, nextStatus: ActionableStatus) => Promise<void>;
}>) {
  const transitions = ALLOWED_TRANSITIONS[report.status];

  if (transitions.length === 0) {
    return (
      <span className="text-xs font-semibold text-text-secondary">
        No further actions
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {transitions.map((nextStatus) => (
        <button
          className={TRANSITION_BUTTON_STYLES[nextStatus]}
          disabled={busy}
          key={nextStatus}
          onClick={() => void onUpdate(report, nextStatus)}
          type="button"
        >
          {busy ? 'Saving…' : TRANSITION_ACTION_LABELS[nextStatus]}
        </button>
      ))}
    </div>
  );
}

function TableHeader({ children }: Readonly<{ children: string }>) {
  return (
    <th
      className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-text-secondary"
      scope="col"
    >
      {children}
    </th>
  );
}

function ReportImage({
  imageUrl,
  originalUrl,
}: Readonly<{
  imageUrl: string | null;
  originalUrl: string | null;
}>) {
  if (imageUrl) {
    return (
      <a
        className="mt-3 inline-block text-sm font-bold text-brand-600 underline decoration-brand-100 underline-offset-4 hover:text-brand-800"
        href={imageUrl}
        rel="noreferrer"
        target="_blank"
      >
        Open uploaded image
      </a>
    );
  }

  if (originalUrl) {
    return (
      <p className="mt-3 text-sm text-text-secondary">
        Image URL is unavailable or invalid.
      </p>
    );
  }

  return <p className="mt-3 text-sm text-text-secondary">No image attached.</p>;
}
