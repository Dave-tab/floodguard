
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BellPlus,
  Check,
  ChevronRight,
  Droplets,
  Share2,
  Shield,
} from 'lucide-react';

import { ResidentShell } from '../../components/layout/ResidentShell';
import {
  ErrorBanner,
  LoadingCard,
  UnavailableBlock,
} from '../../components/ui/DataStateCard';
import {
  getCommunityOverview,
  listActiveCommunities,
} from '../../services/residentService';
import type {
  Community,
  CommunityOverviewData,
} from '../../types/resident';

import { RiskAssessmentCard } from '../risk/RiskAssessmentCard';
import { SafetyGuidelinesCard } from '../safety/SafetyGuidelinesCard';
import { WeatherTelemetryCard } from '../weather/WeatherTelemetryCard';
import { VerifiedHazardsPreviewCard } from '../resident/VerifiedHazardsPreviewCard';

function CommunityOverviewContent({
  communityId,
}: {
  communityId: string;
}) {
  const navigate = useNavigate();

  const [overview, setOverview] = useState<CommunityOverviewData | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [communitiesError, setCommunitiesError] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      try {
        const result = await getCommunityOverview(communityId);

        if (!cancelled) {
          setOverview(result);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setOverview(null);
          setError(
            'Could not retrieve community overview data. Please try again.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    async function loadCommunities() {
      try {
        const result = await listActiveCommunities();

        if (!cancelled) {
          setCommunities(result);
          setCommunitiesError(false);
        }
      } catch {
        if (!cancelled) {
          setCommunities([]);
          setCommunitiesError(true);
        }
      }
    }

    void loadOverview();
    void loadCommunities();

    return () => {
      cancelled = true;
    };
  }, [communityId, refreshCount]);

  function handleRetry() {
    setIsLoading(true);
    setError(null);
    setRefreshCount((count) => count + 1);
  }

  async function handleShare() {
    if (!overview) return;

    const shareTitle = `${overview.community.name} Flood Risk Overview`;
    const shareText =
      `Community weather context and prototype flood-risk information for ` +
      `${overview.community.name}, ${overview.community.lga}.`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch (shareError) {
        // Do not copy anything when the user intentionally cancels sharing.
        if (
          shareError instanceof DOMException &&
          shareError.name === 'AbortError'
        ) {
          return;
        }
      }
    }

    try {
      if (!navigator.clipboard?.writeText) return;

      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);

      window.setTimeout(() => {
        setShareCopied(false);
      }, 2000);
    } catch {
      // Clipboard access may be unavailable due to browser permissions.
    }
  }

  return (
    <ResidentShell
      subtitle="Community Overview"
      activeCommunityId={communityId}
    >
      <div className="flex w-full flex-col gap-4 px-4 pb-8 pt-4 md:px-8">
        {isLoading ? (
          <div className="flex flex-col gap-4">
            <LoadingCard rows={2} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="flex flex-col gap-4 lg:col-span-7">
                <LoadingCard rows={3} />
                <LoadingCard rows={3} />
              </div>

              <div className="flex flex-col gap-4 lg:col-span-5">
                <LoadingCard rows={3} />
                <LoadingCard rows={3} />
              </div>
            </div>
          </div>
        ) : error ? (
          <ErrorBanner
            title="Unable to load community overview"
            message={error}
            onRetry={handleRetry}
          />
        ) : !overview ? (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-6">
            <UnavailableBlock
              badgeText="Community Not Found"
              title="This community is not available"
              message="The community may not be configured or active. Return to Explore and select an available community."
              actionLabel="Back to Explore"
              onAction={() => navigate('/')}
            />
          </div>
        ) : (
          <>
            {/* Breadcrumb and community navigation */}
            <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <nav
                  aria-label="Community breadcrumb"
                  className="flex items-center gap-1.5 overflow-x-auto py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant"
                >
                  <Link
                    to="/"
                    className="flex-shrink-0 transition-colors hover:text-primary"
                  >
                    {overview.community.state}
                  </Link>

                  <ChevronRight
                    className="h-3.5 w-3.5 flex-shrink-0 opacity-60"
                    aria-hidden="true"
                  />

                  <Link
                    to="/"
                    className="flex-shrink-0 transition-colors hover:text-primary"
                  >
                    {overview.community.lga}
                  </Link>

                  <ChevronRight
                    className="h-3.5 w-3.5 flex-shrink-0 opacity-60"
                    aria-hidden="true"
                  />

                  <span className="flex-shrink-0 font-bold text-secondary">
                    {overview.community.name}
                  </span>
                </nav>

                <div className="inline-flex items-center gap-2 self-start rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span>Prototype data — verify before relying on it</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-surface-container-lowest px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-surface-container-low"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>All Communities</span>
                </Link>

                {!communitiesError && communities.length > 1 && (
                  <select
                    aria-label="Switch active community"
                    value={overview.community.id}
                    onChange={(event) => {
                      navigate(
                        `/communities/${encodeURIComponent(event.target.value)}`,
                      );
                    }}
                    className="h-9 rounded-lg border border-slate-200 bg-surface-container-lowest px-3 text-xs font-semibold text-primary focus:border-secondary focus:outline-none"
                  >
                    {communities.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.lga})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Community identity */}
            <section className="relative overflow-hidden rounded-xl bg-primary-container p-4 text-on-primary shadow-md md:p-6">
              <div className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 rounded-full bg-gradient-to-br from-secondary/20 via-surface-tint/10 to-transparent blur-xl" />

              <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-secondary-fixed">
                      Community Overview
                    </span>

                    <h1 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-white md:text-3xl">
                      {overview.community.name}
                    </h1>

                    <p className="text-sm text-on-primary-container">
                      {overview.community.lga}
                      {overview.community.basinLabel
                        ? `, ${overview.community.basinLabel}`
                        : `, ${overview.community.state}`}
                    </p>
                  </div>

                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-container-highest/20 text-secondary-fixed md:hidden">
                    <Droplets
                      className="h-5 w-5"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/report-hazard?communityId=${encodeURIComponent(communityId)}`}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-white shadow transition-all hover:bg-secondary/90 active:scale-95 md:flex-initial"
                  >
                    <BellPlus className="h-4 w-4" aria-hidden="true" />
                    <span>Report a Hazard Here</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => void handleShare()}
                    aria-label={
                      shareCopied
                        ? 'Community link copied'
                        : 'Share community overview'
                    }
                    className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-surface-container-highest/25 p-2.5 text-white transition-colors hover:bg-surface-container-highest/40"
                  >
                    {shareCopied ? (
                      <Check
                        className="h-4 w-4 text-secondary-fixed"
                        aria-hidden="true"
                      />
                    ) : (
                      <Share2
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </div>
              </div>
            </section>

            {/* Weather, risk, hazards and safety */}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
              <div className="flex flex-col gap-4 lg:col-span-7">
                <WeatherTelemetryCard
                  weather={overview.weather}
                  onRetry={handleRetry}
                />

                <RiskAssessmentCard risk={overview.risk} />
              </div>

              <div className="flex flex-col gap-4 lg:col-span-5">
                <VerifiedHazardsPreviewCard
                  hazards={overview.verifiedHazards}
                />

                <SafetyGuidelinesCard
                  lgaLabel={overview.community.lga}
                  guidelines={overview.safetyGuidelines}
                  hotlines={overview.hotlines}
                />
              </div>
            </div>

            {/* Prototype transparency notice */}
            <footer className="flex flex-col gap-2 pb-4 pt-3 text-center text-xs text-on-surface-variant">
              <div className="flex items-center justify-center gap-1.5 font-semibold">
                <Shield className="h-4 w-4" aria-hidden="true" />
                <span>FloodGuard AI Prototype Transparency Notice</span>
              </div>

              <p className="mx-auto max-w-2xl px-2 leading-relaxed">
                This prototype may display simulated demonstration data.
                Weather information, community reports and risk assessments
                should not be treated as official emergency warnings.
                Always follow instructions from the appropriate local
                emergency management authorities.
              </p>
            </footer>
          </>
        )}
      </div>
    </ResidentShell>
  );
}

export function CommunityOverviewPage() {
  const { communityId } = useParams<{ communityId: string }>();

  if (!communityId) {
    return (
      <ResidentShell subtitle="Community Overview">
        <div className="p-6">
          <UnavailableBlock
            badgeText="Missing Community"
            title="No community was selected"
            message="Return to Explore and select a configured community."
            actionLabel="Back to Explore"
            onAction={() => {
              window.location.assign('/');
            }}
          />
        </div>
      </ResidentShell>
    );
  }

  return (
    <CommunityOverviewContent
      key={communityId}
      communityId={communityId}
    />
  );
}
