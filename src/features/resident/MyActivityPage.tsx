
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Plus,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { ResidentShell } from '../../components/layout/ResidentShell';
import {
  listMyReports,
  type OwnReport,
  type OwnReportStatus,
} from '../../services/reportService';
import type { HazardCategory } from '../../types/resident';

const STATUS_ITEMS = [
  {
    status: 'pending',
    label: 'Pending',
    description: 'Awaiting administrator review',
    icon: Clock3,
    iconStyle: 'bg-amber-50 text-amber-700',
  },
  {
    status: 'verified',
    label: 'Verified',
    description: 'Confirmed by an administrator',
    icon: CheckCircle2,
    iconStyle: 'bg-green-50 text-green-700',
  },
  {
    status: 'rejected',
    label: 'Rejected',
    description: 'Not approved after review',
    icon: XCircle,
    iconStyle: 'bg-red-50 text-red-700',
  },
] as const;

const STATUS_BADGES: Record<OwnReportStatus, { label: string; style: string }> = {
  pending: { label: 'Pending review', style: 'bg-amber-50 text-amber-800' },
  verified: { label: 'Verified', style: 'bg-green-50 text-green-800' },
  rejected: { label: 'Rejected', style: 'bg-red-50 text-red-800' },
  in_progress: { label: 'In progress', style: 'bg-slate-100 text-slate-700' },
  resolved: { label: 'Resolved', style: 'bg-slate-100 text-slate-700' },
};

const CATEGORY_LABELS: Record<HazardCategory, string> = {
  flooded_road: 'Flooded road',
  rising_water_level: 'Rising water level',
  blocked_drainage: 'Blocked drainage',
  overflowing_waterway: 'Overflowing waterway',
  damaged_drainage: 'Damaged drainage',
  other: 'Other hazard',
};

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

export function MyActivityPage() {
  const [reports, setReports] = useState<OwnReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      setReports(await listMyReports());
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load your reports. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const countOf = (status: OwnReportStatus) =>
    reports.filter((report) => report.status === status).length;

  return (
    <ResidentShell subtitle="My Activity">
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Explore
        </Link>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-secondary">
              <FileText className="h-4 w-4" />
              Your reporting history
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-primary">
              My Activity
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
              Keep track of the hazard reports you submit and follow
              their review progress.
            </p>
          </div>

          <Link
            to="/report-hazard"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Submit a report
          </Link>
        </div>

        {/* Report status overview */}
        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-primary">
              Report overview
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              A summary of the reports submitted through your account.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {STATUS_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.label}
                  className="rounded-xl border border-border-soft bg-surface-container-lowest p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-text-secondary">
                      {item.label}
                    </span>

                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.iconStyle}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>

                  <p className="mt-4 text-2xl font-bold text-primary">
                    {loading || error ? '—' : countOf(item.status)}
                  </p>

                  <p className="mt-1 text-xs text-text-secondary">
                    {item.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Personal report history */}
        <section className="overflow-hidden rounded-xl border border-border-soft bg-surface-container-lowest shadow-sm">
          <div className="border-b border-border-soft p-5">
            <h2 className="text-lg font-bold text-primary">
              Your hazard reports
            </h2>

            <p className="mt-1 text-sm text-text-secondary">
              View your submissions and monitor their review status.
            </p>
          </div>

          {loading && (
            <p className="px-5 py-14 text-center text-sm text-text-secondary" role="status">
              Loading your reports…
            </p>
          )}

          {!loading && error && (
            <div className="px-5 py-14 text-center" role="alert">
              <p className="text-sm text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && reports.length === 0 && (
            <div className="px-5 py-14 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
                <FileText className="h-7 w-7 text-secondary" />
              </div>

              <h3 className="text-lg font-bold text-primary">
                You have not submitted any reports yet
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
                Your submitted hazard reports will appear here with their
                review status.
              </p>

              <Link
                to="/report-hazard"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
              >
                Submit your first report
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}

          {!loading && !error && reports.length > 0 && (
            <ul className="divide-y divide-border-soft">
              {reports.map((report) => {
                const badge = STATUS_BADGES[report.status] ?? {
                  label: report.status,
                  style: 'bg-slate-100 text-slate-700',
                };

                return (
                  <li key={report.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-primary">
                          {CATEGORY_LABELS[report.category] ?? 'Hazard report'}
                        </h3>
                        <p className="mt-1 font-mono text-xs text-text-secondary">
                          {report.referenceCode} · Submitted{' '}
                          {formatDate(report.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${badge.style}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                      {report.description}
                    </p>

                    {report.reviewNote && (
                      <p className="mt-3 rounded-lg bg-surface-container-low p-3 text-sm text-primary">
                        <span className="font-semibold">Reviewer note: </span>
                        {report.reviewNote}
                      </p>
                    )}

                    {report.reviewedAt && (
                      <p className="mt-2 text-xs text-text-secondary">
                        Reviewed {formatDate(report.reviewedAt)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Privacy information */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border-soft bg-surface-container-low p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />

          <div>
            <h3 className="text-sm font-semibold text-primary">
              Your reports are account-specific
            </h3>

            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              Your report history is visible only to you and authorised
              administrators. Pending and rejected reports are never shown
              publicly as confirmed hazards.
            </p>
          </div>
        </div>
      </main>
    </ResidentShell>
  );
}
