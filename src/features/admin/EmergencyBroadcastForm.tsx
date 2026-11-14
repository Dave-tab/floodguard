import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  supabase,
  type AlertPayload,
  type AlertSeverity,
  type CommunityPayload,
} from '../../services/supabaseClient';

interface RecentBroadcast extends AlertPayload {
  community_name: string;
}

const SEVERITIES: AlertSeverity[] = [
  'LOW',
  'MODERATE',
  'HIGH',
  'CRITICAL',
];

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  LOW: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  MODERATE: 'border-amber-300 bg-amber-50 text-amber-900',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-900',
  CRITICAL: 'border-red-300 bg-red-50 text-red-900',
};

function formatDate(value: string | null): string {
  if (!value) return 'No expiry set';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'An unexpected error occurred. Please try again.';
}

function getBroadcastStatus(expiresAt: string | null): 'Active' | 'Expired' {
  if (!expiresAt) return 'Active';

  const expiryTime = new Date(expiresAt).getTime();
  return Number.isFinite(expiryTime) && expiryTime > Date.now()
    ? 'Active'
    : 'Expired';
}

function toLocalDateTimeValue(date: Date): string {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

export default function EmergencyBroadcastForm() {
  const [communities, setCommunities] = useState<CommunityPayload[]>([]);
  const [broadcasts, setBroadcasts] = useState<RecentBroadcast[]>([]);
  const [communityId, setCommunityId] = useState('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
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

    if (!supabase) {
      setCommunityError(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load communities.',
      );
      setIsLoadingCommunities(false);
      return;
    }

    try {
      const result = await supabase
        .from('communities')
        .select('id, community_name, state, lga, latitude, longitude, is_active')
        .eq('is_active', true)
        .order('community_name', { ascending: true });

      if (result.error) {
        throw new Error(`Unable to load communities: ${result.error.message}`);
      }

      setCommunities(result.data ?? []);
    } catch (caught: unknown) {
      setCommunityError(getErrorMessage(caught));
      setCommunities([]);
    } finally {
      setIsLoadingCommunities(false);
    }
  }, []);

  const loadBroadcasts = useCallback(async () => {
    setIsLoadingBroadcasts(true);
    setBroadcastError(null);

    if (!supabase) {
      setBroadcastError(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load broadcasts.',
      );
      setIsLoadingBroadcasts(false);
      return;
    }

    try {
      const result = await supabase
        .from('alerts')
        .select(
          'id, title, message, community_id, severity, expires_at, source_type, issued_at, created_by',
        )
        .eq('source_type', 'admin_notice')
        .order('issued_at', { ascending: false })
        .limit(5);

      if (result.error) {
        throw new Error(
          `Unable to load recent broadcasts: ${result.error.message}`,
        );
      }

      const rows = result.data ?? [];
      const communityIds = [
        ...new Set(
          rows.flatMap((alert) =>
            alert.community_id ? [alert.community_id] : [],
          ),
        ),
      ];
      let affectedCommunities: CommunityPayload[] = [];

      if (communityIds.length > 0) {
        const communitiesResult = await supabase
          .from('communities')
          .select(
            'id, community_name, state, lga, latitude, longitude, is_active',
          )
          .in('id', communityIds);

        if (communitiesResult.error) {
          throw new Error(
            `Unable to load broadcast communities: ${communitiesResult.error.message}`,
          );
        }

        affectedCommunities = communitiesResult.data ?? [];
      }

      const namesById = new Map(
        affectedCommunities.map((community) => [
          community.id,
          community.community_name,
        ]),
      );

      setBroadcasts(
        rows.map((alert) => ({
          ...alert,
          community_name: alert.community_id
            ? namesById.get(alert.community_id) ?? 'Community unavailable'
            : 'All communities',
        })),
      );
    } catch (caught: unknown) {
      setBroadcastError(getErrorMessage(caught));
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
      !communities.some((community) => community.id === communityId)
    ) {
      setSubmitError('Choose a valid affected community.');
      return;
    }

    if (!supabase) {
      setSubmitError(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before submitting.',
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const userResult = await supabase.auth.getUser();

      if (userResult.error) {
        throw new Error(
          `Unable to verify the administrator session: ${userResult.error.message}`,
        );
      }

      if (!userResult.data.user) {
        throw new Error(
          'Sign in with an administrator account to send a broadcast.',
        );
      }

      const result = await supabase.from('alerts').insert({
        title: trimmedTitle,
        message: trimmedMessage,
        community_id: communityId === 'all' ? null : communityId,
        severity,
        expires_at: expiryDate.toISOString(),
        source_type: 'admin_notice',
        created_by: userResult.data.user.id,
        issued_at: new Date().toISOString(),
      });

      if (result.error) {
        throw new Error(
          `The broadcast could not be sent: ${result.error.message}`,
        );
      }

      setTitle('');
      setMessage('');
      setCommunityId('all');
      setSeverity('');
      setExpiresAt('');
      setSuccessMessage('Emergency broadcast sent successfully.');
      await loadBroadcasts();
    } catch (caught: unknown) {
      setSubmitError(getErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  const minimumExpiry = toLocalDateTimeValue(new Date());

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-red-700">
          Admin communications
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Emergency broadcast
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Send a time-limited community notice. Broadcasts are informational
          notices and are not a substitute for official emergency alerts.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <form
          className="space-y-5 rounded-xl border border-red-200 bg-white p-5 shadow-sm sm:p-6"
          onSubmit={(event) => void submitBroadcast(event)}
        >
          <div className="border-b border-red-100 pb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Create a broadcast
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Choose the affected area, severity, and expiry time.
            </p>
          </div>

          {communityError && (
            <p
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              role="alert"
            >
              {communityError}
            </p>
          )}

          {submitError && (
            <p
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              role="alert"
            >
              {submitError}
            </p>
          )}

          {successMessage && (
            <p
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
              role="status"
            >
              {successMessage}
            </p>
          )}

          <label className="block text-sm font-medium text-slate-800">
            Alert title
            <input
              autoComplete="off"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 placeholder:text-slate-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Flood warning for affected communities"
              required
              type="text"
              value={title}
            />
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Message body
            <textarea
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950 placeholder:text-slate-400 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30"
              onChange={(event) => setMessage(event.target.value)}
              placeholder="FLOOD WARNING: Heavy rainfall and rising water levels have been reported. Follow updates from local authorities and avoid flooded roads."
              required
              rows={5}
              value={message}
            />
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Affected community
            <select
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30"
              disabled={isLoadingCommunities}
              onChange={(event) => setCommunityId(event.target.value)}
              value={communityId}
            >
              <option value="all">All Communities</option>
              {communities.map((community) => (
                <option key={community.id} value={community.id}>
                  {community.community_name} · {community.lga}, {community.state}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              All Communities sends a platform-wide notice.
            </span>
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Alert severity
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
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Expiry time
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
            {isSubmitting ? 'Sending broadcast…' : 'Send emergency broadcast'}
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
                Latest five administrator-issued notices.
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
            <div
              className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3"
              role="alert"
            >
              <p className="text-sm text-red-800">{broadcastError}</p>
              <button
                className="mt-2 text-sm font-semibold text-red-900 underline"
                onClick={() => void loadBroadcasts()}
                type="button"
              >
                Retry
              </button>
            </div>
          )}

          {isLoadingBroadcasts ? (
            <p
              className="mt-5 rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600"
              role="status"
            >
              Loading recent broadcasts…
            </p>
          ) : !broadcastError && broadcasts.length === 0 ? (
            <p className="mt-5 rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600">
              No administrator broadcasts are available.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-slate-200">
              {broadcasts.map((broadcast) => {
                const status = getBroadcastStatus(broadcast.expires_at);

                return (
                  <li className="py-4 first:pt-0 last:pb-0" key={broadcast.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-slate-900">
                          {broadcast.title}
                        </h4>
                        <p className="mt-1 text-sm text-slate-600">
                          {broadcast.community_name}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-bold ${SEVERITY_STYLES[broadcast.severity]}`}
                        >
                          {broadcast.severity}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            status === 'Active'
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-slate-100 text-slate-700'
                          }`}
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
                          {formatDate(broadcast.issued_at)}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-medium">Expires: </dt>
                        <dd className="inline">
                          {formatDate(broadcast.expires_at)}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}