import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  MapPin,
  Search,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ResidentShell } from '../../components/layout/ResidentShell';
import { getLocationDataMode } from '../location/services/locationService';
import { listActiveAlerts, type PublicAlert } from '../../services/adminService';

type AlertSource = 'ai_prediction' | 'admin_notice';
type AlertSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info';
type AlertStatus = 'active' | 'resolved';
type SourceFilter = 'all' | AlertSource;
type StatusFilter = 'all' | AlertStatus;

interface CommunityAlert {
  id: string;
  title: string;
  summary: string;
  description: string;
  source: AlertSource;
  severity: AlertSeverity;
  status: AlertStatus;
  community: string;
  location: string;
  issuedAt: string;
  publishedBy: string;
  recommendations: string[];
}

const DEMO_ALERTS: CommunityAlert[] = [
  {
    id: 'alert-001',
    title: 'Potential flood risk following heavy rainfall',
    summary:
      'The prediction model has identified conditions that may increase flood risk in this area.',
    description:
      'This demonstration alert represents an AI-generated prediction that has passed administrator review. It is not a live assessment of current conditions.',
    source: 'ai_prediction',
    severity: 'high',
    status: 'active',
    community: 'Lekki Phase 1',
    location: 'Eti-Osa, Lagos State',
    issuedAt: 'Demo issue time',
    publishedBy: 'Reviewed by an authorised administrator',
    recommendations: [
      'Monitor official weather and emergency updates.',
      'Keep important documents and essential items in a safe place.',
      'Avoid walking or driving through floodwater.',
      'Report observed flooding through the FloodGuard reporting feature.',
    ],
  },
  {
    id: 'alert-002',
    title: 'Community drainage maintenance notice',
    summary:
      'Residents are advised to keep drainage channels and nearby waterways free from obstruction.',
    description:
      'This illustrative administrator-issued notice demonstrates how community safety information can be published on FloodGuard.',
    source: 'admin_notice',
    severity: 'moderate',
    status: 'active',
    community: 'Surulere Central',
    location: 'Surulere, Lagos State',
    issuedAt: 'Demo issue time',
    publishedBy: 'FloodGuard administrator',
    recommendations: [
      'Avoid dumping refuse into drainage channels.',
      'Report blocked drainage channels.',
      'Keep an eye on local weather updates.',
    ],
  },
  {
    id: 'alert-003',
    title: 'Elevated rainfall-related flood risk',
    summary:
      'A reviewed prediction indicates potentially elevated flood risk under the assessed conditions.',
    description:
      'This demonstration record illustrates an approved AI prediction alert. It does not represent a current forecast.',
    source: 'ai_prediction',
    severity: 'critical',
    status: 'active',
    community: 'Diobu',
    location: 'Port Harcourt, Rivers State',
    issuedAt: 'Demo issue time',
    publishedBy: 'Reviewed by an authorised administrator',
    recommendations: [
      'Stay away from floodwater and flooded roads.',
      'Move away from low-lying areas if water begins rising.',
      'Follow instructions from local emergency authorities.',
      'Contact emergency services if you are in immediate danger.',
    ],
  },
  {
    id: 'alert-004',
    title: 'Previous community safety advisory',
    summary:
      'An earlier community notice has been marked as resolved.',
    description:
      'This example demonstrates how residents can still access previously published alerts after their active status ends.',
    source: 'admin_notice',
    severity: 'low',
    status: 'resolved',
    community: 'Lekki Phase 1',
    location: 'Eti-Osa, Lagos State',
    issuedAt: 'Demo issue time',
    publishedBy: 'FloodGuard administrator',
    recommendations: [
      'Continue following general flood safety guidance.',
      'Check for newer community notices when necessary.',
    ],
  },
];

const severityStyles: Record<AlertSeverity, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  moderate: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
};

const severityLabels: Record<AlertSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  info: 'Information',
};

/** Live mode shows real administrator notices from the API; demo mode keeps the samples. */
const IS_LIVE = getLocationDataMode() === 'api';

function formatIssued(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Issue time unavailable'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function toCommunityAlert(alert: PublicAlert): CommunityAlert {
  const firstSentence = alert.message.split(/(?<=[.!?])\s/)[0] ?? alert.message;

  return {
    id: alert.id,
    title: alert.title,
    summary: firstSentence,
    description: alert.message,
    source: 'admin_notice',
    severity: alert.severity,
    status: 'active',
    community: alert.communityName ?? 'All communities',
    location: alert.communityName ? 'community notice' : 'platform-wide notice',
    issuedAt: formatIssued(alert.issuedAt),
    publishedBy: 'FloodGuard administrator (not an official government warning)',
    recommendations: [],
  };
}

function SourceLabel({ source }: { source: AlertSource }) {
  if (source === 'ai_prediction') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
        <BrainCircuit className="h-3.5 w-3.5" />
        AI Prediction · Admin reviewed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
      <ShieldCheck className="h-3.5 w-3.5" />
      Admin-issued alert
    </span>
  );
}

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${severityStyles[severity]}`}
    >
      {severityLabels[severity]}
    </span>
  );
}

export function AlertsPage() {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [liveAlerts, setLiveAlerts] = useState<CommunityAlert[]>([]);
  const [liveLoading, setLiveLoading] = useState(IS_LIVE);
  const [liveError, setLiveError] = useState('');

  useEffect(() => {
    if (!IS_LIVE) return;
    let active = true;

    listActiveAlerts()
      .then((rows) => {
        if (active) setLiveAlerts(rows.map(toCommunityAlert));
      })
      .catch((error: unknown) => {
        if (active) {
          setLiveError(
            error instanceof Error
              ? error.message
              : 'Unable to load alerts. Please try again.',
          );
        }
      })
      .finally(() => {
        if (active) setLiveLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const allAlerts = IS_LIVE ? liveAlerts : DEMO_ALERTS;

  const activeAlerts = allAlerts.filter(
    (alert) => alert.status === 'active',
  );

  const query = search.trim().toLowerCase();

const filteredAlerts = allAlerts.filter((alert) => {
  const matchesSource =
    sourceFilter === 'all' || alert.source === sourceFilter;

  const matchesStatus =
    statusFilter === 'all' || alert.status === statusFilter;

  const matchesSeverity =
    severityFilter === 'all' || alert.severity === severityFilter;

  const matchesSearch =
    !query ||
    `${alert.title} ${alert.community} ${alert.location} ${alert.summary}`
      .toLowerCase()
      .includes(query);

  return (
    matchesSource &&
    matchesStatus &&
    matchesSeverity &&
    matchesSearch
  );
});

  const aiAlertCount = activeAlerts.filter(
    (alert) => alert.source === 'ai_prediction',
  ).length;

  const adminAlertCount = activeAlerts.filter(
    (alert) => alert.source === 'admin_notice',
  ).length;

  return (
    <ResidentShell subtitle="Alerts">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-6">
          <Link
            to="/"
            className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Explore
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-secondary">
                <Bell className="h-4 w-4" />
                Community safety updates
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-primary">
                Flood Alerts
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
                Stay informed about reviewed flood-risk predictions and
                important notices issued by FloodGuard administrators.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-bold text-amber-900">
              {IS_LIVE ? 'FloodGuard notices' : 'Demonstration data'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              {IS_LIVE
                ? 'These are notices published by FloodGuard administrators. They are not official government flood warnings. Follow NEMA, NiMet, NIHSA and your State Emergency Management Agency for official warnings.'
                : 'These sample alerts are for interface demonstration only. They are not live flood warnings, verified local conditions, or official emergency instructions.'}
            </p>
            {IS_LIVE && liveLoading && (
              <p className="mt-2 text-xs text-amber-800" role="status">
                Loading current notices…
              </p>
            )}
            {IS_LIVE && liveError && (
              <p className="mt-2 text-xs font-semibold text-red-700" role="alert">
                {liveError}
              </p>
            )}
          </div>
        </div>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-border-soft bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">
                Active alerts
              </span>
              <Bell className="h-5 w-5 text-secondary" />
            </div>
            <p className="mt-3 text-3xl font-bold text-primary">
              {activeAlerts.length}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {IS_LIVE ? 'Notices currently in effect' : 'Published demonstration records'}
            </p>
          </div>

          <div className="rounded-xl border border-border-soft bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">
                AI predictions
              </span>
              <BrainCircuit className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-3 text-3xl font-bold text-primary">
              {aiAlertCount}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {IS_LIVE ? 'Risk predictions reviewed by admins' : 'Sample predictions reviewed by admins'}
            </p>
          </div>

          <div className="rounded-xl border border-border-soft bg-surface-container-lowest p-5 shadow-sm sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">
                Admin-issued
              </span>
              <ShieldCheck className="h-5 w-5 text-violet-600" />
            </div>
            <p className="mt-3 text-3xl font-bold text-primary">
              {adminAlertCount}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {IS_LIVE ? 'Community notices from FloodGuard admins' : 'Sample community notices'}
            </p>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-border-soft bg-surface-container-lowest p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-primary">
                Alert feed
              </h2>
              <p className="mt-1 text-xs text-text-secondary">
                Browse published warnings and community notices.
              </p>
            </div>

            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search alerts or communities"
                aria-label="Search alerts or communities"
                className="w-full rounded-lg border border-border-soft bg-surface-container-lowest py-2.5 pl-9 pr-3 text-sm text-primary outline-none transition focus:border-primary"
              />
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {([
              ['all', 'All sources'],
              ['ai_prediction', 'AI predictions'],
              ['admin_notice', 'Admin alerts'],
            ] as [SourceFilter, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSourceFilter(value)}
                aria-pressed={sourceFilter === value}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  sourceFilter === value
                    ? 'bg-primary text-white'
                    : 'bg-surface-container text-text-secondary hover:bg-surface-container-high'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-secondary">
                Alert status
              </span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                className="w-full rounded-lg border border-border-soft bg-surface-container-lowest px-3 py-2.5 text-sm text-primary outline-none focus:border-primary"
              >
                <option value="active">Active alerts</option>
                <option value="resolved">Resolved alerts</option>
                <option value="all">All statuses</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-secondary">
                Severity
              </span>
              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
                className="w-full rounded-lg border border-border-soft bg-surface-container-lowest px-3 py-2.5 text-sm text-primary outline-none focus:border-primary"
              >
                <option value="all">All severity levels</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-4">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => {
              const isExpanded = expandedAlert === alert.id;

              return (
                <article
                  key={alert.id}
                  className="overflow-hidden rounded-xl border border-border-soft bg-surface-container-lowest shadow-sm"
                >
                  <div className="p-4 md:p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={alert.severity} />
                      <SourceLabel source={alert.source} />

                      {alert.status === 'resolved' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Resolved
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-primary">
                          {alert.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                          {alert.summary}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedAlert(isExpanded ? null : alert.id)
                        }
                        aria-expanded={isExpanded}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-surface-container px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-surface-container-high"
                      >
                        {isExpanded ? 'Show less' : 'View details'}
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border-soft pt-3 text-xs text-text-secondary">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {alert.community} · {alert.location}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {alert.issuedAt}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border-soft bg-surface-container-low p-4 md:p-5">
                      <div className="mb-4">
                        <h4 className="mb-2 text-sm font-bold text-primary">
                          About this alert
                        </h4>
                        <p className="text-sm leading-relaxed text-text-secondary">
                          {alert.description}
                        </p>
                      </div>

                      {alert.recommendations.length > 0 && (
                      <div className="mb-4">
                        <h4 className="mb-2 text-sm font-bold text-primary">
                          Recommended safety actions
                        </h4>
                        <ul className="space-y-2">
                          {alert.recommendations.map((recommendation) => (
                            <li
                              key={recommendation}
                              className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary"
                            >
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                              {recommendation}
                            </li>
                          ))}
                        </ul>
                      </div>
                      )}

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-soft pt-3 text-xs text-text-secondary">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Published by: {alert.publishedBy}</span>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-border-soft bg-surface-container-lowest px-5 py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
                <Waves className="h-6 w-6 text-text-secondary" />
              </div>
              <h3 className="text-base font-bold text-primary">
                No alerts found
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
                No alerts match your current filters. Try changing your
                search or selecting a different alert status.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('all');
                  setStatusFilter('active');
                  setSeverityFilter('all');
                  setSearch('');
                }}
                className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border-soft bg-surface-container-low p-4">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
          <p className="text-xs leading-relaxed text-text-secondary">
            FloodGuard alerts are intended to support community awareness.
            Always follow official emergency instructions. Never rely on an
            AI prediction alone when making emergency decisions.
          </p>
        </div>
      </div>
    </ResidentShell>
  );
}
