import { useCallback, useEffect, useState } from 'react';

import {
  supabase,
  type CommunityPayload,
  type RiskAssessmentPayload,
} from '../../services/supabaseClient';
import {
  AdminAlert,
  AdminLoadingState,
  AdminRiskBadge,
  AdminSectionHeader,
} from './AdminShared';
import { formatAdminDate, getAdminErrorMessage } from './adminUtils';

function displayValue(value: string | number | null): string {
  if (value === null || value === '') return 'Unavailable';
  return String(value);
}

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
  const [communities, setCommunities] = useState<CommunityPayload[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState('');
  const [assessment, setAssessment] =
    useState<RiskAssessmentPayload | null>(null);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(true);
  const [isLoadingAssessment, setIsLoadingAssessment] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [assessmentRetryKey, setAssessmentRetryKey] = useState(0);

  const loadCommunities = useCallback(async () => {
    setIsLoadingCommunities(true);
    setCommunityError(null);

   if (!supabase) {
  setCommunities([]);
  setCommunityError(null);
  setIsLoadingCommunities(false);
  return;
}

    try {
      const result = await supabase
        .from('communities')
        .select(
          'id, community_name, state, lga, latitude, longitude, is_active',
        )
        .eq('is_active', true)
        .order('community_name', { ascending: true });

      if (result.error) {
        throw new Error(
          `Unable to load communities: ${result.error.message}`,
        );
      }

      const rows = result.data ?? [];
      setCommunities(rows);
      setSelectedCommunityId((current) =>
        rows.some((community) => community.id === current)
          ? current
          : rows[0]?.id ?? '',
      );
    } catch (error: unknown) {
      setCommunityError(getAdminErrorMessage(error));
      setCommunities([]);
      setSelectedCommunityId('');
    } finally {
      setIsLoadingCommunities(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadCommunities);
  }, [loadCommunities]);

  useEffect(() => {
    const client = supabase;
    let isCurrentRequest = true;

    void Promise.resolve().then(async () => {
      if (!isCurrentRequest) return;

      if (!selectedCommunityId || !client) {
        setAssessment(null);
        setAssessmentError(null);
        setIsLoadingAssessment(false);
        return;
      }

      setIsLoadingAssessment(true);
      setAssessmentError(null);
      setAssessment(null);

      try {
        const result = await client
          .from('risk_assessments')
          .select('*')
          .eq('community_id', selectedCommunityId)
          .order('assessment_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (result.error) {
          throw new Error(
            `Unable to load the risk assessment: ${result.error.message}`,
          );
        }

        if (isCurrentRequest) {
          setAssessment(result.data);
        }
      } catch (error: unknown) {
        if (isCurrentRequest) {
          setAssessmentError(getAdminErrorMessage(error));
        }
      } finally {
        if (isCurrentRequest) {
          setIsLoadingAssessment(false);
        }
      }
    });

    return () => {
      isCurrentRequest = false;
    };
  }, [selectedCommunityId, assessmentRetryKey]);

  const selectedCommunity =
    communities.find((community) => community.id === selectedCommunityId) ??
    null;

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
        description="Review stored assessment inputs and their reported limitations."
        descriptionClassName="mt-1 text-sm text-slate-600"
        eyebrow="Admin monitoring"
        eyebrowClassName="text-sm font-semibold uppercase tracking-wide text-teal-700"
        title="Community risk overview"
        titleClassName="mt-1 text-2xl font-bold tracking-tight text-slate-950"
      >
        <CommunitySelector
          communities={communities}
          disabled={isLoadingCommunities || communities.length === 0}
          selectedCommunityId={selectedCommunityId}
          onChange={setSelectedCommunityId}
        />
      </AdminSectionHeader>

      {communityError && (
        <AdminAlert className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{communityError}</p>
          <button
            className="mt-3 rounded-lg bg-red-800 px-3 py-2 text-sm font-semibold text-white hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2"
            onClick={() => void loadCommunities()}
            type="button"
          >
            Retry
          </button>
        </AdminAlert>
      )}

      {isLoadingCommunities && (
        <AdminLoadingState className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Loading communities…
        </AdminLoadingState>
      )}

      {!isLoadingCommunities && !communityError && !selectedCommunity && (
        <CommunityUnavailableState />
      )}

      {!isLoadingCommunities && selectedCommunity && (
        <SelectedCommunityRisk
          assessment={assessment}
          assessmentError={assessmentError}
          isLoadingAssessment={isLoadingAssessment}
          onRetryAssessment={() =>
            setAssessmentRetryKey((current) => current + 1)
          }
          selectedCommunity={selectedCommunity}
        />
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
  communities: CommunityPayload[];
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
          <option key={community.id} value={community.id}>
            {community.community_name} · {community.lga}, {community.state}
          </option>
        ))}
      </select>
    </label>
  );
}

function CommunityUnavailableState() {
  let message = 'No communities are currently available to monitor.';

  if (!supabase) {
    message =
      'Community risk preview is ready. Connect the backend to load communities and their stored risk assessments.';
  }

  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
      {message}
    </p>
  );
}

function SelectedCommunityRisk({
  selectedCommunity,
  assessment,
  assessmentError,
  isLoadingAssessment,
  onRetryAssessment,
}: Readonly<{
  selectedCommunity: CommunityPayload;
  assessment: RiskAssessmentPayload | null;
  assessmentError: string | null;
  isLoadingAssessment: boolean;
  onRetryAssessment: () => void;
}>) {
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">
          {selectedCommunity.community_name}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {selectedCommunity.lga}, {selectedCommunity.state}
        </p>
      </section>

      {assessmentError && (
        <AdminAlert className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{assessmentError}</p>
          <button
            className="mt-3 rounded-lg bg-red-800 px-3 py-2 text-sm font-semibold text-white hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2"
            onClick={onRetryAssessment}
            type="button"
          >
            Retry assessment
          </button>
        </AdminAlert>
      )}

      <AssessmentResult
        assessment={assessment}
        assessmentError={assessmentError}
        isLoading={isLoadingAssessment}
      />
    </>
  );
}

function AssessmentResult({
  assessment,
  assessmentError,
  isLoading,
}: Readonly<{
  assessment: RiskAssessmentPayload | null;
  assessmentError: string | null;
  isLoading: boolean;
}>) {
  if (isLoading) {
    return (
      <AdminLoadingState className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
        Loading community risk information…
      </AdminLoadingState>
    );
  }

  if (assessmentError) return null;

  if (!assessment) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-semibold text-amber-950">
          Risk information unavailable
        </h3>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          No risk assessment is stored for this community. Missing assessment
          data is not treated as a LOW risk classification.
        </p>
      </section>
    );
  }

  return <RiskAssessmentDetails assessment={assessment} />;
}

function RiskAssessmentDetails({
  assessment,
}: Readonly<{ assessment: RiskAssessmentPayload }>) {
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Latest risk assessment
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Stored assessment result; not an official flood warning or
              validated prediction.
            </p>
          </div>
          <AdminRiskBadge
            ariaLabel={`Risk classification: ${assessment.risk_level}`}
            riskLevel={assessment.risk_level}
            variant="community"
          />
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Assessment time
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {formatAdminDate(assessment.assessment_time, 'Unavailable')}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Risk score
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {assessment.risk_score ?? 'Unavailable'}
            </dd>
          </div>
        </dl>
      </section>

      <AssessmentInputs assessment={assessment} />

      <section
        aria-labelledby="assessment-explanation-heading"
        className="rounded-xl border border-teal-200 bg-teal-50 p-5"
      >
        <h3
          className="text-lg font-semibold text-teal-950"
          id="assessment-explanation-heading"
        >
          AI risk explanation
        </h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-teal-950">
          {assessment.ai_explanation ??
            'An explanation is not available for this assessment.'}
        </p>
        <p className="mt-3 text-xs text-teal-800">
          This explanation does not calculate or change the stored risk
          classification.
        </p>
      </section>
    </>
  );
}

function AssessmentInputs({
  assessment,
}: Readonly<{ assessment: RiskAssessmentPayload }>) {
  return (
    <section aria-labelledby="assessment-inputs-heading">
      <h3
        className="text-lg font-semibold text-slate-900"
        id="assessment-inputs-heading"
      >
        Assessment inputs
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Forecast and recent rainfall are shown separately. Values are displayed
        as stored in the assessment.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DataCard
          label="Forecast rainfall"
          value={displayValue(assessment.rainfall_forecast)}
          hint="Forecast, not observed rainfall"
        />
        <DataCard
          label="Recent rainfall"
          value={displayValue(assessment.recent_rainfall)}
        />
        <DataCard
          label="Drainage condition"
          value={displayValue(assessment.drainage_condition)}
        />
        <DataCard
          label="Historical incidents"
          value={displayValue(assessment.historical_incidents)}
        />
      </div>
    </section>
  );
}
