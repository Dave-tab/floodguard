import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  listActiveAlerts,
  listAdminCommunities,
  publishAlert,
  type AdminCommunityRisk,
  type AlertSeverity,
  type AlertType,
  type PublicAlert,
} from '../../services/adminService';
import {
  AdminAlert,
  AdminLoadingState,
  AdminSectionHeader,
  AdminSeverityBadge,
  AdminStatusOutput,
} from './AdminShared';
import {
  formatAdminDate,
  getAdminErrorMessage,
} from './adminUtils';

type RecentBroadcast = PublicAlert;

const SEVERITIES: AlertSeverity[] = ['info', 'low', 'moderate', 'high', 'critical'];

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  community_notice: 'Community notice',
  flood_warning: 'Flood warning (FloodGuard notice)',
  weather_notice: 'Weather notice',
  safety_advisory: 'Safety advisory',
  other: 'Other',
};

const BROADCAST_STATUS_STYLES = {
  Active: 'bg-emerald-100 text-emerald-900',
  Expired: 'bg-slate-100 text-slate-700',
};

function getBroadcastStatus(expiresAt: string | null): 'Active' | 'Expired' {
  if (!expiresAt) return 'Active';

  const expiryTime = new Date(expiresAt).getTime();
  if (Number.isFinite(expiryTime) && expiryTime > Date.now()) return 'Active';
  return 'Expired';
}

function toLocalDateTimeValue(date: Date): string {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

function BroadcastHistory({
  broadcasts,
  hasError,
}: Readonly<{
  broadcasts: RecentBroadcast[];
  hasError: boolean;
}>) {
  if (!hasError && broadcasts.length === 0) {
    return (
      <p className="mt-5 rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600">
        No active administrator notices.
      </p>
    );
  }

  return (
    <ul className="mt-5 divide-y divide-slate-200">
      {broadcasts.map((broadcast) => {
        const status = getBroadcastStatus(broadcast.expiresAt);

        return (
          <li className="py-4 first:pt-0 last:pb-0" key={broadcast.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-900">
                  {broadcast.title}
                </h4>
                <p className="mt-1 text-sm text-slate-600">
                  {broadcast.communityName ?? 'All communities'} ·{' '}
                  {ALERT_TYPE_LABELS[broadcast.alertType]}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminSeverityBadge severity={broadcast.severity} />
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BROADCAST_STATUS_STYLES[status]}`}
                >
                  {status}
                </span>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
              {broadcast.message}
            </p>
            <dl className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
              <div>
                <dt className="inline font-medium">Issued: </dt>
                <dd className="inline">
                  {formatAdminDate(broadcast.issuedAt)}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium">Expires: </dt>
                <dd className="inline">
                  {broadcast.expiresAt === null
                    ? 'No expiry set'
                    : formatAdminDate(broadcast.expiresAt)}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

export default function EmergencyBroadcastForm() {
  const [communities, setCommunities] = useState<AdminCommunityRisk[]>([]);
  const [broadcasts, setBroadcasts] = useState<RecentBroadcast[]>([]);
  const [communityId, setCommunityId] = useState('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
  const [alertType, setAlertType] = useState<AlertType>('community_notice');
  const [expiresAt, setExpiresAt] = useState('');
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(true);
  const [isLoadingBroadcasts, setIsLoadingBroadcasts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadCommunities = useCallback(async () => {
    setIsLoadingCommunities(true);
    setCommunityError(null);

    try {
      const rows = await listAdminCommunities();
      setCommunities(
        rows.sort((left, right) =>
          left.communityName.localeCompare(right.communityName),
        ),
      );
    } catch (error: unknown) {
      setCommunityError(getAdminErrorMessage(error));
      setCommunities([]);
    } finally {
      setIsLoadingCommunities(false);
    }
  }, []);

  const loadBroadcasts = useCallback(async () => {
    setIsLoadingBroadcasts(true);
    setBroadcastError(null);

    try {
      setBroadcasts((await listActiveAlerts()).slice(0, 5));
    } catch (error: unknown) {
      setBroadcastError(getAdminErrorMessage(error));
      setBroadcasts([]);
    } finally {
      setIsLoadingBroadcasts(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadCommunities);
    void Promise.resolve().then(loadBroadcasts);
  }, [loadBroadcasts, loadCommunities]);

  async function submitBroadcast(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    const trimmedTitle = title.trim();
    const trimmedMessage = message.trim();
    const expiryDate = new Date(expiresAt);

    if (!trimmedTitle || !trimmedMessage) {
      setSubmitError('Enter both a title and a message.');
      return;
    }

    if (!severity) {
      setSubmitError('Choose an alert severity.');
      return;
    }

    if (!expiresAt || !Number.isFinite(expiryDate.getTime())) {
      setSubmitError('Choose a valid expiry time.');
      return;
    }

    if (expiryDate.getTime() <= Date.now()) {
      setSubmitError('Expiry time must be in the future.');
      return;
    }

    if (
      communityId !== 'all' &&
      !communities.some((community) => community.communityId === communityId)
    ) {
      setSubmitError('Choose a valid affected community.');
      return;
    }

    if (trimmedTitle.length < 3) {
      setSubmitError('The title must be at least 3 characters.');
      return;
    }

    if (trimmedMessage.length < 10) {
      setSubmitError('The message must be at least 10 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      await publishAlert({
        title: trimmedTitle,
        message: trimmedMessage,
        severity,
        alertType,
        communityId: communityId === 'all' ? null : communityId,
        expiresAt: expiryDate.toISOString(),
      });

      setTitle('');
      setMessage('');
      setCommunityId('all');
      setSeverity('');
      setAlertType('community_notice');
      setExpiresAt('');
      setSuccessMessage('Notice published. Residents can now see it on the Alerts page.');
      await loadBroadcasts();
    } catch (error: unknown) {
      setSubmitError(getAdminErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const minimumExpiry = toLocalDateTimeValue(new Date());


  return (
    <section className="space-y-6">
      <AdminSectionHeader
        description="Notices are FloodGuard administrator announcements. They are not official government warnings and do not change risk assessments."
        descriptionClassName="mt-2 max-w-3xl text-sm leading-6 text-slate-600"
        eyebrow="Admin communications"
        eyebrowClassName="text-sm font-semibold uppercase tracking-wide text-red-700"
        title="Emergency broadcast"
        titleClassName="mt-1 text-2xl font-bold tracking-tight text-slate-950"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <form
          className="space-y-5 rounded-xl border border-red-200 bg-white p-5 shadow-sm sm:p-6"
          onSubmit={submitBroadcast}
        >
          <div className="border-b border-red-100 pb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Compose an emergency notice
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Choose the affected area, severity, and expiry time.
            </p>
          </div>

          {communityError && (
            <AdminAlert
              as="p"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {communityError}
            </AdminAlert>
          )}

          {submitError && (
            <AdminAlert
              as="p"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {submitError}
            </AdminAlert>
          )}

          {successMessage && (
            <AdminStatusOutput
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              {successMessage}
            </AdminStatusOutput>
          )}

          <label className="block text-sm font-medium text-slate-800">
            Alert title{' '}
            <input
              autoComplete="off"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 placeholder:text-slate-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30"
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder="Drainage clearing in your area"
              required
              type="text"
              value={title}
            />
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Message body{' '}
            <textarea
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 placeholder:text-slate-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30"
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1000}
              placeholder="Describe what residents should know. Refer to official agencies (NEMA, NiMet, NIHSA) for government warnings."
              required
              rows={5}
              value={message}
            />
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Affected community{' '}
            <select
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30"
              disabled={isLoadingCommunities}
              onChange={(event) => setCommunityId(event.target.value)}
              value={communityId}
            >
              <option value="all">All Communities</option>
              {communities.map((community) => (
                <option key={community.communityId} value={community.communityId}>
                  {community.communityName} · {community.lga}, {community.state}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              All Communities sends a platform-wide notice.
            </span>
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Alert severity{' '}
            <select
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30"
              onChange={(event) =>
                setSeverity(event.target.value as AlertSeverity | '')
              }
              required
              value={severity}
            >
              <option value="" disabled>
                Choose severity
              </option>
              {SEVERITIES.map((option) => (
                <option key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Notice type{' '}
            <select
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30"
              onChange={(event) => setAlertType(event.target.value as AlertType)}
              value={alertType}
            >
              {Object.entries(ALERT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Expiry time{' '}
            <input
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30"
              min={minimumExpiry}
              onChange={(event) => setExpiresAt(event.target.value)}
              required
              type="datetime-local"
              value={expiresAt}
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Displayed in your local time zone.
            </span>
          </label>

          <button
            className="inline-flex w-full items-center justify-center rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            disabled={isSubmitting || isLoadingCommunities}
            type="submit"
          >
            {isSubmitting ? 'Publishing notice…' : 'Publish notice'}
          </button>
        </form>

        <section
          aria-labelledby="recent-broadcasts-heading"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                className="text-lg font-semibold text-slate-900"
                id="recent-broadcasts-heading"
              >
                Recent broadcasts
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Latest five active administrator notices.
              </p>
            </div>
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
              onClick={() => void loadBroadcasts()}
              type="button"
            >
              Refresh
            </button>
          </div>

          {broadcastError && (
            <AdminAlert className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{broadcastError}</p>
              <button
                className="mt-2 text-sm font-semibold text-red-900 underline"
                onClick={() => void loadBroadcasts()}
                type="button"
              >
                Retry
              </button>
            </AdminAlert>
          )}

          {isLoadingBroadcasts && (
            <AdminLoadingState className="mt-5 rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">
              Loading recent broadcasts…
            </AdminLoadingState>
          )}
          {!isLoadingBroadcasts && (
            <BroadcastHistory
              broadcasts={broadcasts}
              hasError={Boolean(broadcastError)}
            />
          )}
        </section>
      </div>
    </section>
  );
}