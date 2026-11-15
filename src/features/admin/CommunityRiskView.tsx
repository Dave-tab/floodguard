import { useCallback, useEffect, useState } from 'react';

import {
  listAdminCommunities,
  reassessCommunity,
  type AdminCommunityRisk,
} from '../../services/adminService';
import {
  AdminAlert,
  AdminLoadingState,
  AdminRiskBadge,
  AdminSectionHeader,
  AdminStatusOutput,
} from './AdminShared';
import { formatAdminDate, getAdminErrorMessage } from './adminUtils';

const STATUS_LABELS: Record<AdminCommunityRisk['status'], string> = {
  available: 'Current assessment',
  insufficient_data: 'Insufficient data',
  unavailable: 'No current assessment',
};

const CONFIDENCE_LABELS: Record<AdminCommunityRisk['confidenceLevel'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  insufficient: 'Insufficient',
};

function DataCard({
  label,
  value,
  hint,
}: Readonly<{
  label: string;
  value: string;
  hint?: string;
}>) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-600">{label}</h3>
      <p className="mt-2 break-words text-lg font-semibold text-slate-900">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </article>
  );
}

export default function CommunityRiskView() {
  const [communities, setCommunities] = useState<AdminCommunityRisk[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReassessing, setIsReassessing] = useState(false);
  const [reassessMessage, setReassessMessage] = useState<string | null>(null);
  const [reassessError, setReassessError] = useState<string | null>(null);

  const loadCommunities = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const rows = (await listAdminCommunities()).sort((left, right) =>
        left.communityName.localeCompare(right.communityName),
      );
      setCommunities(rows);
      setSelectedCommunityId((current) =>
        rows.some((community) => community.communityId === current)
          ? current
          : rows[0]?.communityId ?? '',
      );
    } catch (error: unknown) {
      setError(getAdminErrorMessage(error));
      setCommunities([]);
      setSelectedCommunityId('');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadCommunities);
  }, [loadCommunities]);

  async function handleReassess(communityId: string): Promise<void> {
    setIsReassessing(true);
    setReassessMessage(null);
    setReassessError(null);

    try {
      await reassessCommunity(communityId);
      await loadCommunities();
      setReassessMessage('A new assessment was completed.');
    } catch (error: unknown) {
      setReassessError(getAdminErrorMessage(error));
    } finally {
      setIsReassessing(false);
    }
  }

  const selectedCommunity =
    communities.find((community) => community.communityId === selectedCommunityId) ??
    null;

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
        description="Latest preliminary assessment for each active community, with its data limitations."
        descriptionClassName="mt-1 text-sm text-slate-600"
        eyebrow="Admin monitoring"
        eyebrowClassName="text-sm font-semibold uppercase tracking-wide text-teal-700"
        title="Community risk overview"
        titleClassName="mt-1 text-2xl font-bold tracking-tight text-slate-950"
      >
        <CommunitySelector
          communities={communities}
          disabled={isLoading || communities.length === 0}
          selectedCommunityId={selectedCommunityId}
          onChange={(id) => {
            setSelectedCommunityId(id);
            setReassessMessage(null);
            setReassessError(null);
          }}
        />
      </AdminSectionHeader>

      {error && (
        <AdminAlert className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
          <button
            className="mt-3 rounded-lg bg-red-800 px-3 py-2 text-sm font-semibold text-white hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2"
            onClick={() => void loadCommunities()}
            type="button"
          >
            Retry
          </button>
        </AdminAlert>
      )}

      {isLoading && (
        <AdminLoadingState className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Loading communities…
        </AdminLoadingState>
      )}

      {!isLoading && !error && !selectedCommunity && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          No active communities are currently available to monitor.
        </p>
      )}

      {!isLoading && selectedCommunity && (
        <>
          <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {selectedCommunity.communityName}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {selectedCommunity.lga}, {selectedCommunity.state}
              </p>
            </div>
            <button
              className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                isReassessing ||
                selectedCommunity.latitude === null ||
                selectedCommunity.longitude === null
              }
              onClick={() => void handleReassess(selectedCommunity.communityId)}
              type="button"
            >
              {isReassessing ? 'Assessing…' : 'Re-assess now'}
            </button>
          </section>

          {reassessError && (
            <AdminAlert
              as="p"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {reassessError}
            </AdminAlert>
          )}

          {reassessMessage && (
            <AdminStatusOutput className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              {reassessMessage}
            </AdminStatusOutput>
          )}

          <RiskAssessmentDetails community={selectedCommunity} />
        </>
      )}
    </div>
  );
}

function CommunitySelector({
  communities,
  disabled,
  selectedCommunityId,
  onChange,
}: Readonly<{
  communities: AdminCommunityRisk[];
  disabled: boolean;
  selectedCommunityId: string;
  onChange: (communityId: string) => void;
}>) {
  return (
    <label className="text-sm font-medium text-slate-700">
      Community{' '}
      <select
        className="mt-1 block min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
        disabled={disabled}
        value={selectedCommunityId}
        onChange={(event) => onChange(event.target.value)}
      >
        {communities.length === 0 && (
          <option value="">No communities available</option>
        )}
        {communities.map((community) => (
          <option key={community.communityId} value={community.communityId}>
            {community.communityName} · {community.lga}, {community.state}
          </option>
        ))}
      </select>
    </label>
  );
}

function RiskAssessmentDetails({
  community,
}: Readonly<{ community: AdminCommunityRisk }>) {
  if (!community.assessedAt) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-semibold text-amber-950">
          Risk information unavailable
        </h3>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          {community.summary ??
            'No risk assessment exists for this community yet.'}{' '}
          Missing assessment data is not treated as a Low risk classification.
        </p>
      </section>
    );
  }

  const level = community.status === 'available' ? community.level : null;

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Latest risk assessment
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Preliminary assessment; not an official flood warning or
              validated prediction.
            </p>
          </div>
          <AdminRiskBadge
            ariaLabel={`Risk classification: ${level ?? 'no current level'}`}
            riskLevel={level}
            variant="community"
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DataCard label="Status" value={STATUS_LABELS[community.status]} />
          <DataCard
            label="Risk score"
            value={level && community.score !== null ? String(community.score) : 'Unavailable'}
            hint="0–100, preliminary"
          />
          <DataCard
            label="Evidence confidence"
            value={CONFIDENCE_LABELS[community.confidenceLevel]}
            hint="Reported separately from risk"
          />
          <DataCard
            label="Assessed"
            value={formatAdminDate(community.assessedAt, 'Unavailable')}
            hint={
              community.validUntil
                ? `Valid until ${formatAdminDate(community.validUntil, 'unknown')}`
                : undefined
            }
          />
        </div>
      </section>

      <section aria-labelledby="assessment-missing-heading">
        <h3
          className="text-lg font-semibold text-slate-900"
          id="assessment-missing-heading"
        >
          Missing inputs
        </h3>
        {community.missingInputs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No inputs were reported missing for this assessment.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {community.missingInputs.map((input) => (
              <li
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900"
                key={input}
              >
                {input}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="assessment-explanation-heading"
        className="rounded-xl border border-teal-200 bg-teal-50 p-5"
      >
        <h3
          className="text-lg font-semibold text-teal-950"
          id="assessment-explanation-heading"
        >
          Assessment summary
        </h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-teal-950">
          {community.summary ??
            'A summary is not available for this assessment.'}
        </p>
        <p className="mt-3 text-xs text-teal-800">
          Any AI wording only explains the engine's result; it does not
          calculate or change the risk classification.
        </p>
      </section>
    </>
  );
}
