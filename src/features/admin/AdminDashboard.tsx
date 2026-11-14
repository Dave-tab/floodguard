import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  FileText,
  MapPin,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  supabase,
  type AdminReportStatus,
  type AssessmentRiskLevel,
  type CommunityPayload,
  type HazardReportPayload,
} from '../../services/supabaseClient';
import AdminReportList from './AdminReportList';
import CommunityRiskView from './CommunityRiskView';

interface DashboardMetrics {
  communities: number;
  highRiskAssessments: number;
  totalReports: number;
  pendingReports: number;
  verifiedReports: number;
  resolvedReports: number;
}

interface RecentIncident {
  id: string;
  communityId: string;
  communityName: string;
  category: HazardReportPayload['hazard_category'];
  description: string;
  status: AdminReportStatus;
  submittedAt: string;
}

interface RecentAssessment {
  id: string;
  communityName: string;
  riskLevel: AssessmentRiskLevel;
  assessmentTime: string;
}

interface DashboardData {
  metrics: DashboardMetrics;
  incidents: RecentIncident[];
  assessments: RecentAssessment[];
}

const STATUS_LABELS: Record<AdminReportStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

const STATUS_STYLES: Record<AdminReportStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  verified: 'bg-brand-50 text-brand-800',
  in_progress: 'bg-brand-100 text-brand-900',
  resolved: 'bg-slate-100 text-slate-700',
  rejected: 'bg-red-50 text-red-800',
};

const RISK_STYLES: Record<AssessmentRiskLevel, string> = {
  LOW: 'bg-emerald-50 text-emerald-800',
  MODERATE: 'bg-amber-50 text-amber-800',
  HIGH: 'bg-orange-50 text-orange-800',
  CRITICAL: 'bg-red-50 text-red-800',
};

const CATEGORY_LABELS: Record<HazardReportPayload['hazard_category'], string> = {
  blocked_drainage: 'Blocked drainage',
  damaged_drainage: 'Damaged drainage',
  flooded_road: 'Flooded road',
  other: 'Other',
  overflowing_waterway: 'Overflowing waterway',
  rising_water_level: 'Rising water level',
};

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function MetricCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  tone: 'slate' | 'amber' | 'green' | 'red';
  icon: LucideIcon;
}) {
  const iconTones = {
    slate: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
  } satisfies Record<typeof tone, string>;

  return (
    <article className="rounded-3xl border border-border-soft bg-surface p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text-secondary">{label}</h2>
          <p className="mt-4 text-4xl font-extrabold tabular-nums text-brand-950">
            {value}
          </p>
        </div>
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconTones[tone]}`}
        >
          <Icon aria-hidden="true" className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'An unexpected error occurred while loading the dashboard.';
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setData(null);

    if (!supabase) {
      setError(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load admin data.',
      );
      setIsLoading(false);
      return;
    }

    try {
      const results = await Promise.all([
        supabase
          .from('communities')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('risk_assessments')
          .select('id', { count: 'exact', head: true })
          .in('risk_level', ['HIGH', 'CRITICAL']),
        supabase
          .from('hazard_reports')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('hazard_reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('hazard_reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'verified'),
        supabase
          .from('hazard_reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'resolved'),
        supabase
          .from('hazard_reports')
          .select(
            'id, community_id, hazard_category, description, status, admin_notes, image_url, submitted_at',
          )
          .order('submitted_at', { ascending: false })
          .limit(6),
        supabase
          .from('risk_assessments')
          .select('*')
          .order('assessment_time', { ascending: false })
          .limit(5),
      ]);

      const [communitiesCount, highRiskCount, totalReportsCount, pendingCount,
        verifiedCount, resolvedCount, incidentsResult, assessmentsResult] =
        results;

      const queryErrors: string[] = [];

      if (communitiesCount.error) {
        queryErrors.push(`community count: ${communitiesCount.error.message}`);
      }
      if (highRiskCount.error) {
        queryErrors.push(
          `high-risk assessment count: ${highRiskCount.error.message}`,
        );
      }
      if (totalReportsCount.error) {
        queryErrors.push(`total report count: ${totalReportsCount.error.message}`);
      }
      if (pendingCount.error) {
        queryErrors.push(`pending report count: ${pendingCount.error.message}`);
      }
      if (verifiedCount.error) {
        queryErrors.push(`verified report count: ${verifiedCount.error.message}`);
      }
      if (resolvedCount.error) {
        queryErrors.push(`resolved report count: ${resolvedCount.error.message}`);
      }
      if (incidentsResult.error) {
        queryErrors.push(`recent hazard reports: ${incidentsResult.error.message}`);
      }
      if (assessmentsResult.error) {
        queryErrors.push(
          `recent risk assessments: ${assessmentsResult.error.message}`,
        );
      }

      if (queryErrors.length > 0) {
        throw new Error(`Unable to load dashboard data: ${queryErrors.join('; ')}`);
      }

      const incidents = incidentsResult.data ?? [];
      const assessments = assessmentsResult.data ?? [];
      const communityIds = [
        ...new Set([
          ...incidents.map((report) => report.community_id),
          ...assessments.map((assessment) => assessment.community_id),
        ]),
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
            `Unable to load community names: ${communitiesResult.error.message}`,
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

      setData({
        metrics: {
          communities: communitiesCount.count ?? 0,
          highRiskAssessments: highRiskCount.count ?? 0,
          totalReports: totalReportsCount.count ?? 0,
          pendingReports: pendingCount.count ?? 0,
          verifiedReports: verifiedCount.count ?? 0,
          resolvedReports: resolvedCount.count ?? 0,
        },
        incidents: incidents.map((report) => ({
          id: report.id,
          communityId: report.community_id,
          communityName:
            communityNames.get(report.community_id) ?? 'Community unavailable',
          category: report.hazard_category,
          description: report.description,
          status: report.status,
          submittedAt: report.submitted_at,
        })),
        assessments: assessments.map((assessment) => ({
          id: assessment.id,
          communityName:
            communityNames.get(assessment.community_id) ?? 'Community unavailable',
          riskLevel: assessment.risk_level,
          assessmentTime: assessment.assessment_time,
        })),
      });
    } catch (caught: unknown) {
      setError(getErrorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadDashboard);
  }, [loadDashboard]);

  return (
    <main className="min-h-screen bg-canvas text-brand-950">
      <div className="mx-auto max-w-7xl space-y-10 px-5 py-10 md:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
              Environmental monitoring
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-950 md:text-4xl">
              Monitoring overview
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-text-secondary md:text-base">
              Current database summaries and recent community activity.
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center self-start rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-teal-950/10 transition hover:-translate-y-0.5 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2 focus:ring-offset-canvas sm:self-auto"
            onClick={() => void loadDashboard()}
            type="button"
          >
            Refresh overview
          </button>
        </header>

        {error && (
          <div
            className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900"
            role="alert"
          >
            <p>{error}</p>
            <button
              className="mt-3 font-semibold underline"
              onClick={() => void loadDashboard()}
              type="button"
            >
              Try again
            </button>
          </div>
        )}

        {isLoading ? (
          <p
            className="rounded-3xl border border-border-soft bg-surface p-8 text-center text-sm text-text-secondary"
            role="status"
          >
            Loading monitoring metrics…
          </p>
        ) : (
          <section
            aria-label="Monitoring metrics"
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            <MetricCard
              label="Monitored communities"
              value={data?.metrics.communities ?? 'Unavailable'}
              tone="slate"
              icon={MapPin}
            />
            <MetricCard
              label="High or critical assessments"
              value={
                data?.metrics.highRiskAssessments ??
                'Unavailable'
              }
              tone="red"
              icon={TriangleAlert}
            />
            <MetricCard
              label="Total reports"
              value={data?.metrics.totalReports ?? 'Unavailable'}
              tone="slate"
              icon={FileText}
            />
            <MetricCard
              label="Pending reports"
              value={
                data?.metrics.pendingReports ?? 'Unavailable'
              }
              tone="amber"
              icon={Clock3}
            />
            <MetricCard
              label="Verified reports"
              value={
                data?.metrics.verifiedReports ?? 'Unavailable'
              }
              tone="green"
              icon={ShieldCheck}
            />
            <MetricCard
              label="Resolved reports"
              value={
                data?.metrics.resolvedReports ?? 'Unavailable'
              }
              tone="slate"
              icon={CheckCircle2}
            />
          </section>
        )}

        {data && (
          <section
            aria-label="Recent monitoring activity"
            className="grid gap-6 lg:grid-cols-2"
          >
            <div className="rounded-3xl border border-border-soft bg-surface p-6 shadow-sm">
              <h2 className="text-lg font-bold text-brand-950">
                Recent hazard reports
              </h2>
              {data.incidents.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-text-secondary">
                  No hazard reports are available.
                </p>
              ) : (
                <ul className="mt-5 divide-y divide-border-soft">
                  {data.incidents.map((incident) => (
                    <li className="py-4 first:pt-0 last:pb-0" key={incident.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-brand-950">
                            {CATEGORY_LABELS[incident.category]}
                          </h3>
                          <p className="mt-1 text-sm text-text-secondary">
                            {incident.communityName}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${STATUS_STYLES[incident.status]}`}
                        >
                          {STATUS_LABELS[incident.status]}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                        {incident.description}
                      </p>
                      <p className="mt-2 text-xs text-text-secondary">
                        Submitted {formatDate(incident.submittedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-3xl border border-border-soft bg-surface p-6 shadow-sm">
              <h2 className="text-lg font-bold text-brand-950">
                Recent risk assessments
              </h2>
              {data.assessments.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-text-secondary">
                  No risk assessments are available.
                </p>
              ) : (
                <ul className="mt-5 divide-y divide-border-soft">
                  {data.assessments.map((assessment) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                      key={assessment.id}
                    >
                      <div>
                        <h3 className="font-bold text-brand-950">
                          {assessment.communityName}
                        </h3>
                        <p className="mt-1 text-xs text-text-secondary">
                          Assessed {formatDate(assessment.assessmentTime)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${RISK_STYLES[assessment.riskLevel]}`}
                      >
                        {assessment.riskLevel}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <nav
          aria-label="Admin dashboard sections"
          className="flex flex-wrap gap-3"
        >
          <a
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2"
            href="#report-management"
          >
            Manage reports
          </a>
          <a
            className="inline-flex items-center justify-center rounded-xl border border-brand-100 bg-surface px-5 py-3 text-sm font-bold text-brand-800 transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2"
            href="#community-risk"
          >
            View community risk
          </a>
        </nav>

        <section id="report-management">
          <AdminReportList />
        </section>

        <section
          aria-label="Community risk monitoring"
          className="rounded-3xl border border-border-soft bg-surface-muted p-4 sm:p-6"
          id="community-risk"
        >
          <CommunityRiskView />
        </section>
      </div>
    </main>
  );
}
