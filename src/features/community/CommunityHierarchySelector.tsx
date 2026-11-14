
import { useEffect, useState } from 'react';
import {
  LocateFixed,
  Search,
  MapPin,
  LoaderCircle,
  ChevronDown,
  AlertCircle,
  Database,
  CheckCircle2,
} from 'lucide-react';

import type { Community } from '../../types/resident';

import {
  getLocationDataMode,
  listStates,
  listLgas,
  listCommunitiesByLga,
  searchCommunities,
  resolveCoordinates,
} from '../location/services/locationService';

import type {
  LocationState,
  LocationLga,
  LocationCommunity,
} from '../location/types/location.types';

interface CommunityHierarchySelectorProps {
  // Kept for compatibility with the existing parent component.
  // Location records are now loaded through locationService.
  communities: Community[];
  onSelect: (community: Community) => void;
}

function toResidentCommunity(
  community: LocationCommunity,
): Community {
  return {
    id: community.id,
    name: community.name,
    state: community.stateName,
    lga: community.lgaName,
    basinLabel: null,
    latitude: community.latitude,
    longitude: community.longitude,
    isActive: true,
    isDemoData: community.isDemoData,
    lastSyncedLabel: null,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while loading location data.';
}

function CoverageLabel({
  coverage,
  isDemoData,
}: {
  coverage: string;
  isDemoData: boolean;
}) {
  if (isDemoData) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
        <Database className="h-3 w-3" />
        Demo location data
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-700">
      <CheckCircle2 className="h-3 w-3" />
      {coverage === 'national'
        ? 'National coverage'
        : coverage === 'partial'
          ? 'Partial coverage'
          : 'Coverage not confirmed'}
    </span>
  );
}

export function CommunityHierarchySelector({
  onSelect,
}: CommunityHierarchySelectorProps) {
  const dataMode = getLocationDataMode();

  const [states, setStates] = useState<LocationState[]>([]);
  const [lgas, setLgas] = useState<LocationLga[]>([]);
  const [availableCommunities, setAvailableCommunities] = useState<
    LocationCommunity[]
  >([]);

  const [selectedStateId, setSelectedStateId] = useState('');
  const [selectedLgaId, setSelectedLgaId] = useState('');
  const [selectedCommunityId, setSelectedCommunityId] = useState('');

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<
    LocationCommunity[]
  >([]);

  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isLoadingLgas, setIsLoadingLgas] = useState(false);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const [statesError, setStatesError] = useState('');
  const [lgasError, setLgasError] = useState('');
  const [communitiesError, setCommunitiesError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [locationMessage, setLocationMessage] = useState('');

  const [statesCoverage, setStatesCoverage] = useState('unknown');
  const [statesAreDemo, setStatesAreDemo] = useState(
    dataMode === 'demo',
  );

  const selectedState = states.find(
    (state) => state.id === selectedStateId,
  );

  const selectedLga = lgas.find(
    (lga) => lga.id === selectedLgaId,
  );

  // Load available states.
  useEffect(() => {
    const controller = new AbortController();

    async function loadStates() {
      try {
        setStatesError('');

        const result = await listStates();

        if (controller.signal.aborted) return;

        setStates(result.items);
        setStatesCoverage(result.coverage);
        setStatesAreDemo(result.isDemoData);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatesError(getErrorMessage(error));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingStates(false);
        }
      }
    }

    void loadStates();

    return () => controller.abort();
  }, []);

  // Load LGAs whenever the selected state changes.
  useEffect(() => {
    if (!selectedStateId) return;

    const controller = new AbortController();

    async function loadLgas() {
      try {
        setLgasError('');

        const result = await listLgas(selectedStateId);

        if (controller.signal.aborted) return;

        setLgas(result.items);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLgasError(getErrorMessage(error));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingLgas(false);
        }
      }
    }

    void loadLgas();

    return () => controller.abort();
  }, [selectedStateId]);

  // Load communities whenever the selected LGA changes.
  useEffect(() => {
    if (!selectedLgaId) return;

    const controller = new AbortController();

    async function loadCommunities() {
      try {
        setCommunitiesError('');

        const result = await listCommunitiesByLga(selectedLgaId, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setAvailableCommunities(result.items);
      } catch (error) {
        if (controller.signal.aborted) return;
        setCommunitiesError(getErrorMessage(error));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCommunities(false);
        }
      }
    }

    void loadCommunities();

    return () => controller.abort();
  }, [selectedLgaId]);

  // Search the location service instead of only searching local fixtures.
  useEffect(() => {
    const query = search.trim();

    if (query.length < 2) return;

    const controller = new AbortController();

    async function runSearch() {
      try {
        setSearchError('');

        const result = await searchCommunities(query, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setSearchResults(result.items);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchError(getErrorMessage(error));
        setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }

    void runSearch();

    return () => controller.abort();
  }, [search]);

  function handleStateChange(stateId: string) {
    setSelectedStateId(stateId);
    setSelectedLgaId('');
    setSelectedCommunityId('');

    setLgas([]);
    setAvailableCommunities([]);

    setLgasError('');
    setCommunitiesError('');

    setIsLoadingLgas(Boolean(stateId));
    setIsLoadingCommunities(false);
    setLocationMessage('');
  }

  function handleLgaChange(lgaId: string) {
    setSelectedLgaId(lgaId);
    setSelectedCommunityId('');

    setAvailableCommunities([]);
    setCommunitiesError('');

    setIsLoadingCommunities(Boolean(lgaId));
    setLocationMessage('');
  }

  function selectCommunity(community: LocationCommunity) {
    setSelectedStateId(community.stateId);
    setSelectedLgaId(community.lgaId);
    setSelectedCommunityId(community.id);

    setSearch('');
    setSearchResults([]);
    setLocationMessage('');

    onSelect(toResidentCommunity(community));
  }

  function handleCommunitySubmit() {
    const selected = availableCommunities.find(
      (community) => community.id === selectedCommunityId,
    );

    if (selected) {
      onSelect(toResidentCommunity(selected));
    }
  }

  function handleLocationSearch() {
    if (!navigator.geolocation) {
      setLocationMessage(
        'Location services are not supported by this browser. Please select your community manually.',
      );
      return;
    }

    setIsLocating(true);
    setLocationMessage('Requesting permission to access your location...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await resolveCoordinates({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
          });

          const { state, lga, community } = result.location;

          if (state) {
            setSelectedStateId(state.id);
          }

          if (lga) {
            setSelectedLgaId(lga.id);
          }

          if (community) {
            setSelectedCommunityId(community.id);
          }

          if (
            result.matchStatus === 'matched' &&
            community
          ) {
            onSelect(toResidentCommunity(community));
          }

          setLocationMessage(result.message);
        } catch (error) {
          setLocationMessage(
            getErrorMessage(error) ||
              'We could not resolve your location. Please select your community manually.',
          );
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. You can still select your community manually.'
            : error.code === error.TIMEOUT
              ? 'Your location request timed out. Please try again or select your community manually.'
              : 'We could not access your location. Please select your community manually.';

        setLocationMessage(message);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5 flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-secondary">
          Community discovery
        </span>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-primary">
            Find your community
          </h2>

          <CoverageLabel
            coverage={statesCoverage}
            isDemoData={statesAreDemo}
          />
        </div>

        <p className="text-sm text-on-surface-variant">
          Select your State, LGA and Community to view available
          information.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-3">
        {/* State */}
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-primary">
          State

          <div className="relative">
            <select
              value={selectedStateId}
              disabled={isLoadingStates || Boolean(statesError)}
              onChange={(event) => handleStateChange(event.target.value)}
              className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm font-normal outline-none focus:border-secondary disabled:bg-slate-100"
            >
              <option value="">
                {isLoadingStates
                  ? 'Loading states...'
                  : 'Select a state'}
              </option>

              {states.map((state) => (
                <option key={state.id} value={state.id}>
                  {state.name}
                </option>
              ))}
            </select>

            {isLoadingStates ? (
              <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-secondary" />
            ) : (
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            )}
          </div>
        </label>

        {statesError && (
          <p className="flex items-start gap-2 text-xs text-red-600" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {statesError}
          </p>
        )}

        {/* LGA */}
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-primary">
          Local Government Area

          <div className="relative">
            <select
              value={selectedLgaId}
              disabled={!selectedStateId || isLoadingLgas || Boolean(lgasError)}
              onChange={(event) => handleLgaChange(event.target.value)}
              className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm font-normal outline-none focus:border-secondary disabled:bg-slate-100"
            >
              <option value="">
                {isLoadingLgas
                  ? 'Loading LGAs...'
                  : selectedStateId
                    ? 'Select an LGA'
                    : 'Select a state first'}
              </option>

              {lgas.map((lga) => (
                <option key={lga.id} value={lga.id}>
                  {lga.name}
                </option>
              ))}
            </select>

            {isLoadingLgas ? (
              <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-secondary" />
            ) : (
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            )}
          </div>
        </label>

        {lgasError && (
          <p className="flex items-start gap-2 text-xs text-red-600" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {lgasError}
          </p>
        )}

        {/* Community */}
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-primary">
          Community

          <div className="relative">
            <select
              value={selectedCommunityId}
              disabled={
                !selectedLgaId ||
                isLoadingCommunities ||
                Boolean(communitiesError)
              }
              onChange={(event) =>
                setSelectedCommunityId(event.target.value)
              }
              className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm font-normal outline-none focus:border-secondary disabled:bg-slate-100"
            >
              <option value="">
                {isLoadingCommunities
                  ? 'Loading communities...'
                  : selectedLgaId
                    ? availableCommunities.length
                      ? 'Select a community'
                      : 'No communities available'
                    : 'Select an LGA first'}
              </option>

              {availableCommunities.map((community) => (
                <option key={community.id} value={community.id}>
                  {community.name}
                </option>
              ))}
            </select>

            {isLoadingCommunities ? (
              <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-secondary" />
            ) : (
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            )}
          </div>
        </label>

        {communitiesError && (
          <p className="flex items-start gap-2 text-xs text-red-600" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {communitiesError}
          </p>
        )}

        <button
          type="button"
          onClick={handleCommunitySubmit}
          disabled={!selectedCommunityId || isLoadingCommunities}
          className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          View Community
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />

        <input
          type="search"
          value={search}
          onChange={(event) => {
            const value = event.target.value;
            setSearch(value);
            setSearchError('');

            if (value.trim().length >= 2) {
              setIsSearching(true);
            } else {
              setIsSearching(false);
              setSearchResults([]);
            }
          }}
          placeholder="Search community, LGA or state"
          aria-label="Search communities"
          className="h-11 w-full rounded-lg border border-slate-200 pl-10 pr-10 text-sm outline-none focus:border-secondary"
        />

        {isSearching && (
          <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-secondary" />
        )}
      </div>

      {search.trim().length === 1 && (
        <p className="mb-4 text-xs text-on-surface-variant">
          Enter at least two characters to search.
        </p>
      )}

      {search.trim().length >= 2 && (
        <div className="mb-4 flex flex-col gap-2">
          {searchError && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {searchError}
            </p>
          )}

          {!isSearching && !searchError && searchResults.length === 0 && (
            <p className="rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">
              No communities match this search.
            </p>
          )}

          {searchResults.map((community) => (
            <button
              type="button"
              key={community.id}
              onClick={() => selectCommunity(community)}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:bg-surface-container-low"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-primary">
                  {community.name}
                </span>

                <span className="text-xs text-on-surface-variant">
                  {community.lgaName}, {community.stateName}
                </span>

                {community.isDemoData && (
                  <span className="mt-1 text-[10px] font-medium text-amber-700">
                    Demo record
                  </span>
                )}
              </span>

              <MapPin className="h-4 w-4 shrink-0 text-secondary" />
            </button>
          ))}
        </div>
      )}

      {/* GPS */}
      <button
        type="button"
        onClick={handleLocationSearch}
        disabled={isLocating}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-surface-container-low disabled:opacity-50"
      >
        {isLocating ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
        )}

        {isLocating ? 'Resolving your location...' : 'Use my location'}
      </button>

      <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
        Location access is optional. Your coordinates are used to resolve
        your administrative location. If a community cannot be confidently
        identified, you can complete the selection manually.
      </p>

      {locationMessage && (
        <p
          className="mt-3 rounded-lg bg-surface-container-low p-3 text-xs leading-relaxed text-on-surface-variant"
          role="status"
        >
          {locationMessage}
        </p>
      )}

      {selectedState && selectedLga && (
        <div className="mt-4 rounded-lg border border-slate-100 bg-surface-container-low p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">
            Current selection
          </p>

          <p className="mt-1 text-sm font-semibold text-primary">
            {selectedLga.name}, {selectedState.name}
          </p>
        </div>
      )}
    </section>
  );
}
