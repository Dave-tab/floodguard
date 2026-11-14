
import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  CloudRain,
  Compass,
  Droplets,
  MapPin,
  ShieldCheck,
  Users,
  Waves,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { ResidentShell } from '../../components/layout/ResidentShell';

import type {
  Community,
  VerifiedHazardSummary,
} from '../../types/resident';

import {
  getFeaturedIncident,
  listActiveCommunities,
} from '../../services/residentService';

import {
  listLgas,
  listStates,
} from '../location/services/locationService';

import { CommunityHierarchySelector } from '../community/CommunityHierarchySelector';

export function ExplorePage() {
  const navigate = useNavigate();

  const [communities, setCommunities] = useState<Community[]>([]);
  const [administrativeCoverage, setAdministrativeCoverage] = useState<{
    states: number;
    lgas: number;
  } | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [featuredIncident, setFeaturedIncident] =
    useState<VerifiedHazardSummary | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      setIsLoading(true);
      setLoadError(null);
      setCoverageError(null);

      const [communityResult, incidentResult, statesResult] =
        await Promise.allSettled([
          listActiveCommunities(),
          getFeaturedIncident(),
          listStates(),
        ]);

      if (cancelled) return;

      if (communityResult.status === 'fulfilled') {
        setCommunities(communityResult.value);
      } else {
        setCommunities([]);
        setLoadError(
          'Community records could not be loaded. Please try again.',
        );
      }

      if (incidentResult.status === 'fulfilled') {
        setFeaturedIncident(incidentResult.value);
      } else {
        setFeaturedIncident(null);
      }

      if (statesResult.status === 'fulfilled') {
        const states = statesResult.value.items;

        const lgaResults = await Promise.allSettled(
          states.map((state) => listLgas(state.id)),
        );

        if (cancelled) return;

        const successfulLgaResults = lgaResults.filter(
          (result) => result.status === 'fulfilled',
        );

        const totalLgas = successfulLgaResults.reduce(
          (total, result) =>
            total +
            (result.status === 'fulfilled'
              ? result.value.items.length
              : 0),
          0,
        );

        if (successfulLgaResults.length !== states.length) {
          setCoverageError(
            'Some administrative location records could not be loaded.',
          );
        }

        setAdministrativeCoverage({
          states: states.length,
          lgas: totalLgas,
        });
      } else {
        setAdministrativeCoverage(null);
        setCoverageError(
          'National administrative coverage information is currently unavailable.',
        );
      }

      setIsLoading(false);
    }

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function handleCommunitySelect(community: Community) {
    navigate(`/communities/${encodeURIComponent(community.id)}`);
  }

  const demoCommunities = communities.filter(
    (community) => community.isDemoData,
  ).length;

  const displayedIncident =
    featuredIncident?.status === 'verified'
      ? featuredIncident
      : null;

  return (
    <ResidentShell>
      <main className="overflow-hidden bg-canvas">

        {/* HERO */}
        <section className="relative isolate overflow-hidden bg-brand-950 text-white">

          <div className="pointer-events-none absolute -right-32 -top-40 h-[32rem] w-[32rem] rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-16 -top-24 h-96 w-96 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-48 left-1/3 h-96 w-96 rounded-full bg-brand-600/20 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-12">

            <div className="flex flex-col items-start gap-7 lg:col-span-7">

              <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/30 bg-teal-300/10 px-4 py-2 text-xs font-semibold tracking-wide text-teal-100">
                <span className="h-2 w-2 rounded-full bg-teal-300" />
                COMMUNITY-POWERED FLOOD AWARENESS
              </div>

              <div>
                <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
                  Know the risk.
                  <span className="mt-2 block text-teal-300">
                    Prepare before it happens.
                  </span>
                </h1>

                <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 md:text-lg">
                  Flooding affects communities differently. Find your
                  community, understand available environmental
                  information and discover practical ways to prepare.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href="#community-discovery"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-950/20 transition hover:-translate-y-0.5 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2 focus:ring-offset-brand-950"
                >
                  Explore your community
                  <ArrowRight className="h-4 w-4" />
                </a>

                <Link
                  to="/hazard-map"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <MapPin className="h-4 w-4" />
                  Explore hazard map
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-xs text-slate-300">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-teal-300" />
                  Public information access
                </span>

                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-teal-300" />
                  Community participation
                </span>
              </div>
            </div>

            {/* HERO VISUAL */}
            <div className="relative hidden lg:col-span-5 lg:block">

              <div className="relative mx-auto aspect-square max-w-[410px]">

                <div className="absolute inset-0 rounded-full border border-teal-200/15" />
                <div className="absolute inset-8 rounded-full border border-teal-200/20" />
                <div className="absolute inset-16 rounded-full border border-teal-200/20" />

                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-48 w-48 items-center justify-center rounded-full border border-teal-200/20 bg-teal-300/10 shadow-2xl shadow-teal-950/30 backdrop-blur-sm">
                    <div className="flex h-36 w-36 items-center justify-center rounded-full bg-teal-400/15">
                      <Waves className="h-20 w-20 text-teal-200" strokeWidth={1.3} />
                    </div>
                  </div>
                </div>

                <div className="absolute right-0 top-16 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-md">
                  <CloudRain className="mb-2 h-6 w-6 text-teal-300" />
                  <p className="text-xs font-semibold text-white">
                    Weather context
                  </p>
                  <p className="mt-1 text-[10px] text-slate-300">
                    Environmental information
                  </p>
                </div>

                <div className="absolute bottom-12 left-0 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-md">
                  <ShieldCheck className="mb-2 h-6 w-6 text-teal-300" />
                  <p className="text-xs font-semibold text-white">
                    Risk awareness
                  </p>
                  <p className="mt-1 text-[10px] text-slate-300">
                    Understand local conditions
                  </p>
                </div>

              </div>
            </div>
          </div>

          <a
            href="#community-discovery"
            className="relative mx-auto flex w-fit items-center gap-2 pb-7 text-xs text-slate-300 transition hover:text-white"
          >
            Discover your community
            <ArrowDown className="h-4 w-4" />
          </a>
        </section>

        <div className="mx-auto flex max-w-7xl flex-col gap-16 px-5 py-12 md:px-8 md:py-16">

          {/* COMMUNITY DISCOVERY */}
          <section
            id="community-discovery"
            className="scroll-mt-24"
          >
            <div className="mb-8 max-w-2xl">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
                Start with your location
              </span>

              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-950 md:text-4xl">
                Your community matters.
              </h2>

              <p className="mt-3 text-sm leading-7 text-text-secondary md:text-base">
                Flood awareness starts with understanding what is
                happening around you. Select your location to explore
                available community information.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-12">

              <div className="rounded-3xl border border-border-soft bg-surface p-6 shadow-sm md:p-8 lg:col-span-7">
                <div className="mb-7 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <Compass className="h-6 w-6" />
                  </div>

                  <div>
                    <h3 className="font-bold text-brand-950">
                      Find your community
                    </h3>
                    <p className="mt-1 text-xs text-text-secondary">
                      State · LGA · Community
                    </p>
                  </div>
                </div>

                <CommunityHierarchySelector
                  communities={communities}
                  onSelect={handleCommunitySelect}
                />

                {loadError && (
                  <p className="mt-3 text-xs leading-5 text-amber-700">
                    Community directory information could not be loaded.
                    Location selection may still be available.
                    <button
                      type="button"
                      onClick={() => setReloadKey((key) => key + 1)}
                      className="ml-1 font-semibold underline"
                    >
                      Retry
                    </button>
                  </p>
                )}
              </div>

              {/* COMMUNITY INFORMATION */}
              <div className="flex flex-col gap-5 lg:col-span-5">

                <article className="relative overflow-hidden rounded-3xl bg-brand-950 p-6 text-white shadow-sm">
                  <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-600/20 blur-2xl" />

                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-teal-200">
                        National administrative coverage
                      </span>

                      <MapPin className="h-5 w-5 text-teal-300" />
                    </div>

                    {isLoading ? (
                      <div className="mt-6 space-y-3">
                        <div className="h-10 w-20 animate-pulse rounded-lg bg-white/10" />
                        <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
                      </div>
                    ) : administrativeCoverage ? (
                      <>
                        <div className="mt-6 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-4xl font-extrabold tabular-nums">
                              {administrativeCoverage.states}
                            </p>
                            <p className="mt-2 text-xs leading-5 text-slate-300">
                              States and FCT
                            </p>
                          </div>

                          <div>
                            <p className="text-4xl font-extrabold tabular-nums">
                              {administrativeCoverage.lgas}
                            </p>
                            <p className="mt-2 text-xs leading-5 text-slate-300">
                              Local Government Areas
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 border-t border-white/10 pt-5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-teal-200">
                            Community directory
                          </p>

                          <p className="mt-2 text-3xl font-extrabold tabular-nums">
                            {loadError ? '—' : communities.length}
                          </p>

                          <p className="mt-1 text-xs text-slate-300">
                            {loadError
                              ? 'Community records currently unavailable'
                              : 'Configured community entries'}
                          </p>
                        </div>

                        {demoCommunities > 0 && (
                          <p className="mt-5 rounded-xl border border-amber-200/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
                            {demoCommunities} community entries are demonstration
                            fixtures, not confirmed operational monitoring
                            locations.
                          </p>
                        )}

                        <p className="mt-4 text-[11px] leading-5 text-slate-400">
                          Administrative coverage does not mean that every location
                          has active flood monitoring or verified community reports.
                        </p>
                      </>
                    ) : (
                      <p className="mt-5 text-sm leading-6 text-slate-300">
                        {coverageError ??
                          'Administrative coverage information is unavailable.'}
                      </p>
                    )}
                  </div>
                </article>

                <article className="rounded-3xl border border-border-soft bg-surface p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <ShieldCheck className="h-5 w-5" />
                    </div>

                    <div>
                      <h3 className="font-bold text-brand-950">
                        Community hazard information
                      </h3>
                      <p className="mt-1 text-xs text-text-secondary">
                        Reports available for public review
                      </p>
                    </div>
                  </div>

                  {displayedIncident ? (
                    <div className="mt-5 rounded-2xl border border-border-soft bg-canvas p-4">
                      {displayedIncident.isDemoData && (
                        <span className="mb-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          Sample record
                        </span>
                      )}

                      <h4 className="text-sm font-bold text-brand-950">
                        {displayedIncident.title}
                      </h4>

                      <p className="mt-2 text-xs leading-6 text-text-secondary">
                        {displayedIncident.description}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl bg-canvas p-4">
                      <p className="text-sm font-semibold text-brand-950">
                        No verified public reports available
                      </p>

                      <p className="mt-2 text-xs leading-6 text-text-secondary">
                        There are currently no verified public hazard
                        reports to display. This does not mean that
                        no hazards exist.
                      </p>
                    </div>
                  )}

                  <Link
                    to="/hazard-map"
                    className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand-600 transition hover:text-brand-800"
                  >
                    Explore hazard information
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              </div>
            </div>
          </section>

          {/* HOW IT WORKS */}
          <section>
            <div className="mb-8 max-w-2xl">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
                The platform
              </span>

              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-950 md:text-4xl">
                From awareness to early action.
              </h2>

              <p className="mt-3 text-sm leading-7 text-text-secondary">
                FloodGuard brings together environmental information,
                community awareness and practical preparedness.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">

              <article className="group rounded-3xl border border-border-soft bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                  <MapPin className="h-7 w-7" />
                </div>

                <span className="mt-6 block text-xs font-bold tracking-widest text-brand-600">
                  STEP 01
                </span>

                <h3 className="mt-2 text-lg font-bold text-brand-950">
                  Find your community
                </h3>

                <p className="mt-3 text-sm leading-7 text-text-secondary">
                  Select your State, Local Government Area and
                  Community to explore available local information.
                </p>
              </article>

              <article className="group rounded-3xl border border-border-soft bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                  <CloudRain className="h-7 w-7" />
                </div>

                <span className="mt-6 block text-xs font-bold tracking-widest text-brand-600">
                  STEP 02
                </span>

                <h3 className="mt-2 text-lg font-bold text-brand-950">
                  Understand the context
                </h3>

                <p className="mt-3 text-sm leading-7 text-text-secondary">
                  Review available weather information, risk
                  assessments, verified reports and their limitations.
                </p>
              </article>

              <article className="group rounded-3xl border border-border-soft bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                  <CheckCircle2 className="h-7 w-7" />
                </div>

                <span className="mt-6 block text-xs font-bold tracking-widest text-brand-600">
                  STEP 03
                </span>

                <h3 className="mt-2 text-lg font-bold text-brand-950">
                  Prepare and participate
                </h3>

                <p className="mt-3 text-sm leading-7 text-text-secondary">
                  Learn practical safety measures and participate
                  in community hazard reporting when available.
                </p>
              </article>

            </div>
          </section>

          {/* PUBLIC PARTICIPATION */}
          <section className="relative overflow-hidden rounded-3xl bg-brand-950 px-6 py-10 text-white md:px-10 md:py-14">
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl" />

            <div className="relative flex flex-col gap-7 md:flex-row md:items-center md:justify-between">

              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-sm font-semibold text-teal-300">
                  <Droplets className="h-5 w-5" />
                  Safer communities start with awareness
                </div>

                <h2 className="mt-4 text-2xl font-extrabold leading-tight md:text-3xl">
                  Prepared communities are better equipped to face
                  environmental challenges.
                </h2>

                <p className="mt-4 text-sm leading-7 text-slate-300">
                  Explore public community information without
                  signing in. Account authentication will be required
                  when resident reporting is integrated.
                </p>
              </div>

              <a
                href="#community-discovery"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-4 text-sm font-bold text-white transition hover:bg-brand-500"
              >
                Find your community
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </section>

        </div>
      </main>
    </ResidentShell>
  );
}
