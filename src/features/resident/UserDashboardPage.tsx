import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  FileText,
  MapPin,
  Pencil,
  Plus,
  X,
} from 'lucide-react';

import { ResidentShell } from '../../components/layout/ResidentShell';
import { ErrorBanner, LoadingCard } from '../../components/ui/DataStateCard';
import { listActiveAlerts, type PublicAlert } from '../../services/adminService';
import {
  listMyReports,
  updatePreferredCommunity,
  type OwnReport,
  type OwnReportStatus,
} from '../../services/reportService';
import { getCommunityOverview } from '../../services/residentService';
import type { Community, CommunityOverviewData } from '../../types/resident';
import { CommunityHierarchySelector } from '../community/CommunityHierarchySelector';
import { RiskAssessmentCard } from '../risk/RiskAssessmentCard';
import { WeatherTelemetryCard } from '../weather/WeatherTelemetryCard';
import { patchCurrentUser, useCurrentUser } from '../auth/useCurrentUser';

const STATUS_BADGES: Record<OwnReportStatus, { label: string; style: string }> = {
  pending: { label: 'Pending review', style: 'bg-amber-50 text-amber-800' },
  verified: { label: 'Verified', style: 'bg-green-50 text-green-800' },
  rejected: { label: 'Rejected', style: 'bg-red-50 text-red-800' },
  in_progress: { label: 'In progress', style: 'bg-slate-100 text-slate-700' },
  resolved: { label: 'Resolved', style: 'bg-slate-100 text-slate-700' },
};

const COUNTED: { status: OwnReportStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'verified', label: 'Verified' },
  { status: 'rejected', label: 'Rejected' },
];

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

type Loadable<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'error'; message: string };

function useLoadable<T>(loader: (() => Promise<T>) | null) {
  const [result, setResult] = useState<Loadable<T>>({ state: 'loading' });

  const run = useCallback(async () => {
    if (!loader) return;
    setResult({ state: 'loading' });
    try {
      setResult({ state: 'ready', value: await loader() });
    } catch (error: unknown) {
      setResult({ state: 'error', message: errorText(error, 'Unable to load this section.') });
    }
  }, [loader]);

  useEffect(() => {
    void Promise.resolve().then(run);
  }, [run]);

  return { result, reload: run };
}

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: Readonly<{
  title: string;
  icon: typeof MapPin;
  action?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-primary">
          <Icon className="h-5 w-5 text-brand-600" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CommunityChooser({
  onChosen,
  onCancel,
}: Readonly<{ onChosen: (community: Community) => void; onCancel?: () => void }>) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Choose your State, LGA and community. Only communities FloodGuard currently covers can be
          selected.
        </p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-text-secondary hover:bg-white"
            aria-label="Cancel changing community"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <CommunityHierarchySelector communities={[]} onSelect={onChosen} />
    </div>
  );
}

function MyCommunitySection({ communityId }: Readonly<{ communityId: string | null }>) {
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const loader = useCallback(
    () => (communityId ? getCommunityOverview(communityId) : Promise.resolve(null)),
    [communityId],
  );
  const { result, reload } = useLoadable<CommunityOverviewData | null>(loader);

  const save = async (community: Community) => {
    setSaving(true);
    setSaveError('');
    try {
      const saved = await updatePreferredCommunity(community.id);
      patchCurrentUser({ preferredCommunityId: saved.preferredCommunityId });
      setChoosing(false);
    } catch (error: unknown) {
      setSaveError(errorText(error, 'Unable to save your community. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const changeButton = communityId && !choosing && (
    <button
      type="button"
      onClick={() => setChoosing(true)}
      className="inline-flex items-center gap-2 rounded-xl border border-border-soft px-3 py-2 text-xs font-bold text-brand-950 hover:bg-brand-50"
    >
      <Pencil className="h-3.5 w-3.5" />
      Change community
    </button>
  );

  let body: ReactNode;
  if (!communityId || choosing) {
    body = (
      <>
        {!communityId && (
          <p className="mb-4 text-sm text-text-secondary">
            You have not chosen a community yet. Pick one to see its weather, risk assessment and
            notices here.
          </p>
        )}
        <CommunityChooser
          onChosen={(community) => void save(community)}
          onCancel={communityId ? () => setChoosing(false) : undefined}
        />
        {saving && <p className="mt-3 text-sm text-text-secondary" role="status">Saving…</p>}
      </>
    );
  } else if (result.state === 'loading') {
    body = <LoadingCard rows={4} />;
  } else if (result.state === 'error') {
    body = <ErrorBanner title="Community data unavailable" message={result.message} onRetry={() => void reload()} />;
  } else if (result.value === null) {
    body = (
      <p className="text-sm text-text-secondary">
        Your saved community is no longer available. Choose another one.
      </p>
    );
  } else {
    const { community, weather, risk } = result.value;
    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xl font-extrabold text-brand-950">{community.name}</p>
            <p className="text-sm text-text-secondary">
              {community.lga}, {community.state}
            </p>
          </div>
          <Link
            to={`/communities/${encodeURIComponent(community.id)}`}
            className="inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900"
          >
            Full community page
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <RiskAssessmentCard risk={risk} />
          <WeatherTelemetryCard weather={weather} onRetry={() => void reload()} />
        </div>
      </div>
    );
  }

  return (
    <SectionCard title="My community" icon={MapPin} action={changeButton}>
      {saveError && (
        <p className="mb-3 text-sm font-semibold text-red-700" role="alert">
          {saveError}
        </p>
      )}
      {body}
    </SectionCard>
  );
}

function MyReportsSection({ communityId }: Readonly<{ communityId: string | null }>) {
  const { result, reload } = useLoadable<OwnReport[]>(listMyReports);
  const reportLink = communityId
    ? `/report-hazard?communityId=${encodeURIComponent(communityId)}`
    : '/report-hazard';

  let body: ReactNode;
  if (result.state === 'loading') {
    body = <LoadingCard rows={3} />;
  } else if (result.state === 'error') {
    body = <ErrorBanner title="Reports unavailable" message={result.message} onRetry={() => void reload()} />;
  } else {
    const reports = result.value;
    body = (
      <>
        <div className="mb-4 grid grid-cols-3 gap-3">
          {COUNTED.map(({ status, label }) => (
            <div key={status} className="rounded-xl border border-border-soft p-3 text-center">
              <p className="text-2xl font-bold text-primary">
                {reports.filter((r) => r.status === status).length}
              </p>
              <p className="text-xs text-text-secondary">{label}</p>
            </div>
          ))}
        </div>
        {reports.length === 0 ? (
          <p className="text-sm text-text-secondary">
            You have not submitted any reports yet. Reports stay private and pending until an
            administrator reviews them.
          </p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {reports.slice(0, 5).map((report) => {
              const badge = STATUS_BADGES[report.status];
              return (
                <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-950">{report.referenceCode}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {formatDate(report.createdAt)} · {report.description}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.style}`}>
                    {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  return (
    <SectionCard
      title="My reports"
      icon={FileText}
      action={
        <Link
          to={reportLink}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-950 px-3 py-2 text-xs font-bold text-white hover:bg-brand-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Report a hazard
        </Link>
      }
    >
      {body}
      <Link
        to="/my-activity"
        className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900"
      >
        All my reports
        <ArrowRight className="h-4 w-4" />
      </Link>
    </SectionCard>
  );
}

function NoticesSection({ communityId }: Readonly<{ communityId: string | null }>) {
  const loader = useCallback(
    () => (communityId ? listActiveAlerts(communityId) : Promise.resolve([] as PublicAlert[])),
    [communityId],
  );
  const { result, reload } = useLoadable<PublicAlert[]>(loader);

  let body: ReactNode;
  if (!communityId) {
    body = <p className="text-sm text-text-secondary">Choose your community to see notices for it.</p>;
  } else if (result.state === 'loading') {
    body = <LoadingCard rows={2} />;
  } else if (result.state === 'error') {
    body = <ErrorBanner title="Notices unavailable" message={result.message} onRetry={() => void reload()} />;
  } else if (result.value.length === 0) {
    body = <p className="text-sm text-text-secondary">There are no current notices for your community.</p>;
  } else {
    body = (
      <ul className="space-y-3">
        {result.value.map((alert) => (
          <li key={alert.id} className="rounded-xl border border-border-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-brand-950">{alert.title}</p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                {alert.severity}
              </span>
            </div>
            <p className="mt-1 text-sm text-text-secondary">{alert.message}</p>
            <p className="mt-2 text-xs text-text-secondary">
              {alert.communityName ?? 'All communities'} · Issued {formatDate(alert.issuedAt)}
              {alert.expiresAt ? ` · Until ${formatDate(alert.expiresAt)}` : ''}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <SectionCard
      title="Notices for my community"
      icon={Bell}
      action={
        <Link to="/alerts" className="text-sm font-bold text-brand-700 hover:text-brand-900">
          All alerts
        </Link>
      }
    >
      <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
        These are notices from FloodGuard administrators, not official government flood warnings.
        Follow NEMA, NiMet, NIHSA and your State Emergency Management Agency for official warnings.
      </p>
      {body}
    </SectionCard>
  );
}

export function UserDashboardPage() {
  const { me, status, error, email, refresh } = useCurrentUser();
  const name = me?.fullName?.trim() || me?.email || email || null;
  const communityId = me?.preferredCommunityId ?? null;

  let content: ReactNode;
  if (status === 'loading' && !me) {
    content = <LoadingCard rows={4} />;
  } else if (status === 'error' && !me) {
    content = (
      <ErrorBanner
        title="Unable to load your account"
        message={error ?? 'Please try again.'}
        onRetry={refresh}
      />
    );
  } else {
    content = (
      <div className="space-y-6">
        <MyCommunitySection communityId={communityId} />
        <div className="grid gap-6 lg:grid-cols-2">
          <MyReportsSection communityId={communityId} />
          <NoticesSection communityId={communityId} />
        </div>
      </div>
    );
  }

  return (
    <ResidentShell subtitle="My dashboard">
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-8">
          <p className="text-sm font-semibold text-brand-600">My dashboard</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-primary">
            {name ? `Welcome, ${name}` : 'Welcome'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Your community at a glance. Risk information is a preliminary assessment, not an
            official flood warning.
          </p>
        </div>
        {content}
      </main>
    </ResidentShell>
  );
}
