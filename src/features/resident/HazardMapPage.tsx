
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Info,
  Layers3,
  List,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import type { Community, HazardCategory } from '../../types/resident';
import { listActiveCommunities } from '../../services/residentService';
import CommunityWeather from './CommunityWeather';
import { ResidentShell } from '../../components/layout/ResidentShell';
import {
  getHazardMapData,
  type CommunityRiskAssessment,
  type FloodSeverity,
  type HazardMapDataStatus,
  type MapHazard,
} from './hazardMapService';

type MapView = 'map' | 'list';
type CommunityOption = Community;

const NIGERIA_CENTER: [number, number] = [9.082, 8.6753];

const HAZARD_CATEGORIES: {
  value: HazardCategory;
  label: string;
  color: string;
}[] = [
  { value: 'flooded_road', label: 'Flooded road', color: '#2563EB' },
  { value: 'rising_water_level', label: 'Rising water level', color: '#0891B2' },
  { value: 'blocked_drainage', label: 'Blocked drainage', color: '#D97706' },
  { value: 'overflowing_waterway', label: 'Overflowing waterway', color: '#9333EA' },
  { value: 'damaged_drainage', label: 'Damaged drainage', color: '#DC2626' },
  { value: 'other', label: 'Other hazard', color: '#64748B' },
];

const SEVERITIES: {
  value: FloodSeverity;
  label: string;
  color: string;
  description: string;
}[] = [
  {
    value: 'low',
    label: 'Low',
    color: '#16A34A',
    description: 'No significant flood indicators currently detected.',
  },
  {
    value: 'high',
    label: 'High',
    color: '#EAB308',
    description: 'Conditions suggest an increased possibility of flooding.',
  },
  {
    value: 'severe',
    label: 'Severe',
    color: '#EA580C',
    description: 'Strong indicators suggest flooding may occur or be developing.',
  },
  {
    value: 'critical',
    label: 'Critical',
    color: '#DC2626',
    description: 'Reliable evidence indicates imminent or ongoing dangerous flooding.',
  },
];

function getCategory(category: HazardCategory) {
  return (
    HAZARD_CATEGORIES.find((item) => item.value === category) ??
    HAZARD_CATEGORIES[HAZARD_CATEGORIES.length - 1]
  );
}

function getSeverity(severity: FloodSeverity) {
  return SEVERITIES.find((item) => item.value === severity) ?? SEVERITIES[0];
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not available';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Not available';

  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'Not available';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Not available';

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);

  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function getStatusLabel(status: HazardMapDataStatus) {
  if (status === 'live') return 'Live data';
  if (status === 'demo') return 'Demo mode';
  return 'Unavailable';
}

function getStatusColor(status: HazardMapDataStatus) {
  if (status === 'live') return 'text-green-700 bg-green-50 border-green-200';
  if (status === 'demo') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function HazardCard({
  hazard,
  onSelect,
  selected,
}: {
  hazard: MapHazard;
  onSelect: () => void;
  selected: boolean;
}) {
  const category = getCategory(hazard.category);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-left transition ${
        selected
          ? 'border-blue-400 bg-blue-50/60'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-1 h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{hazard.title}</p>
            <p className="mt-1 text-sm text-gray-500">{category.label}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
          Verified
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-gray-600">
        {hazard.description}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <MapPin size={13} />
          {hazard.communityName}
        </span>
        <span className="flex items-center gap-1">
          <Clock3 size={13} />
          {formatDate(hazard.reportedAt)}
        </span>
      </div>
    </button>
  );
}

function RiskCard({
  risk,
  onSelect,
  selected,
}: {
  risk: CommunityRiskAssessment;
  onSelect: () => void;
  selected: boolean;
}) {
  const severity = getSeverity(risk.severity);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-left transition ${
        selected
          ? 'border-blue-400 bg-blue-50/60'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-1 h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: severity.color }}
          />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">
              {risk.communityName}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Community flood-risk assessment
            </p>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize"
          style={{
            color: severity.color,
            backgroundColor: `${severity.color}18`,
          }}
        >
          {severity.label}
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-gray-600">
        {risk.summary}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <MapPin size={13} />
          {[risk.lga, risk.state].filter(Boolean).join(', ') || 'Location unavailable'}
        </span>
        <span className="flex items-center gap-1">
          <Clock3 size={13} />
          Assessed {formatRelativeTime(risk.assessedAt)}
        </span>
      </div>
    </button>
  );
}

function HazardMapCanvas({
  hazards,
  risks,
  onHazardSelect,
  onRiskSelect,
}: {
  hazards: MapHazard[];
  risks: CommunityRiskAssessment[];
  onHazardSelect: (hazard: MapHazard) => void;
  onRiskSelect: (risk: CommunityRiskAssessment) => void;
}) {
  return (
    <MapContainer
      center={NIGERIA_CENTER}
      zoom={6}
      scrollWheelZoom
      className="h-full min-h-[480px] w-full rounded-xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {risks.map((risk) => {
        const severity = getSeverity(risk.severity);

        return (
          <CircleMarker
            key={`risk-${risk.id}`}
            center={[risk.latitude, risk.longitude]}
            radius={
              risk.severity === 'critical'
                ? 23
                : risk.severity === 'severe'
                  ? 20
                  : risk.severity === 'high'
                    ? 16
                    : 12
            }
            pathOptions={{
              color: '#FFFFFF',
              weight: 2,
              fillColor: severity.color,
              fillOpacity: 0.8,
            }}
            eventHandlers={{
              click: () => onRiskSelect(risk),
            }}
          >
            <Popup>
              <div className="min-w-[190px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Community flood-risk assessment
                </p>
                <p className="mt-1 font-semibold">{risk.communityName}</p>
                <p
                  className="mt-1 font-bold capitalize"
                  style={{ color: severity.color }}
                >
                  {severity.label} risk
                </p>
                <p className="mt-2 text-sm">{risk.summary}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Assessed: {formatDate(risk.assessedAt)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {hazards.map((hazard) => {
        const category = getCategory(hazard.category);

        return (
          <CircleMarker
            key={`hazard-${hazard.id}`}
            center={[hazard.latitude, hazard.longitude]}
            radius={8}
            pathOptions={{
              color: '#FFFFFF',
              weight: 2,
              fillColor: category.color,
              fillOpacity: 1,
            }}
            eventHandlers={{
              click: () => onHazardSelect(hazard),
            }}
          >
            <Popup>
              <div className="min-w-[180px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  Verified hazard
                </p>
                <p className="mt-1 font-semibold">{hazard.title}</p>
                <p className="mt-1 text-sm">{category.label}</p>
                <p className="mt-2 text-xs text-gray-500">
                  {hazard.communityName}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Reported: {formatDate(hazard.reportedAt)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-white p-3 shadow-sm">
        <MapPin className="text-gray-400" size={22} />
      </div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-gray-500">{description}</p>
    </div>
  );
}

export function HazardMapPage() {
  const [hazards, setHazards] = useState<MapHazard[]>([]);
  const [risks, setRisks] = useState<CommunityRiskAssessment[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(true);
  const [communitiesError, setCommunitiesError] = useState<string | null>(null);

  const [dataStatus, setDataStatus] =
    useState<HazardMapDataStatus>('demo');
  const [riskStatus, setRiskStatus] =
    useState<HazardMapDataStatus>('demo');

  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [riskMessage, setRiskMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<MapView>('map');

  const [search, setSearch] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');

  const [selectedHazard, setSelectedHazard] = useState<MapHazard | null>(null);
  const [selectedRisk, setSelectedRisk] =
    useState<CommunityRiskAssessment | null>(null);

  const [showFilters, setShowFilters] = useState(false);

  const loadHazards = useCallback(async (communityId?: string) => {
    try {
      const result = await getHazardMapData(communityId);

      setHazards(result.hazards);
      setRisks(result.risks);

      setDataStatus(result.status);
      setRiskStatus(result.riskStatus);

      setDataMessage(result.message);
      setRiskMessage(result.riskMessage);
      setLastUpdated(result.lastUpdated);

      setSelectedHazard(null);
      setSelectedRisk(null);
    } catch {
      setHazards([]);
      setRisks([]);
      setDataStatus('unavailable');
      setRiskStatus('unavailable');
      setDataMessage('Unable to retrieve verified hazard information.');
      setRiskMessage('Unable to retrieve community risk assessments.');
      setLastUpdated(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCommunities() {
      try {
        const result = await listActiveCommunities();

        if (cancelled) return;

        setCommunities(result.filter((community) => community.isActive));
      } catch (error) {
        if (cancelled) return;

        setCommunities([]);
        setCommunitiesError(
          error instanceof Error
            ? error.message
            : 'Unable to load active communities.',
        );
      } finally {
        if (!cancelled) {
          setCommunitiesLoading(false);
        }
      }
    }

    void loadCommunities();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadInitialHazards = async () => {
      await loadHazards();
    };

    void loadInitialHazards();
  }, [loadHazards]);

  const communityOptions = useMemo<CommunityOption[]>(() => {
    return [...communities].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [communities]);

  const filteredHazards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return hazards.filter((hazard) => {
      const matchesCommunity =
        selectedCommunity === 'all' ||
        hazard.communityId === selectedCommunity;

      const matchesCategory =
        selectedCategory === 'all' ||
        hazard.category === selectedCategory;

      const matchesSearch =
        !normalizedSearch ||
        [
          hazard.title,
          hazard.description,
          hazard.communityName,
          hazard.state,
          hazard.lga,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesCommunity && matchesCategory && matchesSearch;
    });
  }, [hazards, selectedCommunity, selectedCategory, search]);

  const filteredRisks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return risks.filter((risk) => {
      const matchesCommunity =
        selectedCommunity === 'all' ||
        risk.communityId === selectedCommunity;

      const matchesSeverity =
        selectedSeverity === 'all' ||
        risk.severity === selectedSeverity;

      const matchesSearch =
        !normalizedSearch ||
        [
          risk.communityName,
          risk.summary,
          risk.state,
          risk.lga,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesCommunity && matchesSeverity && matchesSearch;
    });
  }, [risks, selectedCommunity, selectedSeverity, search]);

  const activeCommunityRisk = useMemo(() => {
    if (selectedCommunity === 'all') return null;

    return risks.find(
      (risk) => risk.communityId === selectedCommunity,
    ) ?? null;
  }, [risks, selectedCommunity]);

  const selectedCommunityData = useMemo(
    () =>
      selectedCommunity === 'all'
        ? null
        : communities.find(
            (community) => community.id === selectedCommunity,
          ) ?? null,
    [communities, selectedCommunity],
  );

  const selectedCommunityName =
    selectedCommunityData?.name ??
    (selectedCommunity === 'all' ? 'Nigeria overview' : 'Selected community');

  const totalMapItems = filteredHazards.length + filteredRisks.length;

  const handleCommunityChange = (value: string) => {
  setSelectedCommunity(value);
  setSelectedHazard(null);
  setSelectedRisk(null);
  setLoading(true);

  void loadHazards(value === 'all' ? undefined : value);
};

 const clearFilters = () => {
  setSearch('');
  setSelectedCommunity('all');
  setSelectedCategory('all');
  setSelectedSeverity('all');
  setSelectedHazard(null);
  setSelectedRisk(null);
  setLoading(true);

  void loadHazards();
};

  return (
    <ResidentShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
                <MapIcon size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                  Flood hazard map
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  View verified hazards and community flood-risk assessments.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusColor(dataStatus)}`}
            >
              Hazards: {getStatusLabel(dataStatus)}
            </span>
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusColor(riskStatus)}`}
            >
              Risk: {getStatusLabel(riskStatus)}
            </span>
            <button
              type="button"
             onClick={() => {
                  setLoading(true);
                  void loadHazards(
                  selectedCommunity === 'all' ? undefined : selectedCommunity,
                                  );
                }}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Verified hazards</p>
              <ShieldCheck className="text-green-600" size={19} />
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {hazards.length}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Verified reports with mapped coordinates
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Communities assessed</p>
              <Activity className="text-orange-600" size={19} />
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {new Set(risks.map((risk) => risk.communityId)).size}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Communities with active risk assessments
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Last updated</p>
              <Clock3 className="text-blue-600" size={19} />
            </div>
            <p className="mt-2 text-base font-bold text-gray-900">
              {formatRelativeTime(lastUpdated)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {lastUpdated ? formatDate(lastUpdated) : 'No successful refresh yet'}
            </p>
          </div>
        </div>

        {dataMessage && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Info size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Hazard data notice</p>
              <p className="mt-1">{dataMessage}</p>
            </div>
          </div>
        )}

        {riskMessage && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Info size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Risk assessment notice</p>
              <p className="mt-1">{riskMessage}</p>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search hazards or communities..."
                className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={selectedCommunity}
                onChange={(event) => handleCommunityChange(event.target.value)}
                className="min-w-[180px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 sm:flex-none"
              >
                <option value="all">
                  {communitiesLoading
                    ? 'Loading communities...'
                    : 'All communities'}
                </option>
                {communityOptions.map((community) => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                    {community.lga
                      ? ` — ${community.lga}, ${community.state}`
                      : ` — ${community.state}`}
                  </option>
                ))}
              </select>

              {communitiesError && (
                <p className="mt-2 basis-full text-xs text-red-600">
                  {communitiesError}
                </p>
              )}

              {!communitiesLoading &&
                !communitiesError &&
                communities.length === 0 && (
                  <p className="mt-2 basis-full text-xs text-gray-500">
                    No active communities are currently available.
                  </p>
                )}

              <button
                type="button"
                onClick={() => setShowFilters((current) => !current)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                  showFilters
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <SlidersHorizontal size={16} />
                Filters
              </button>

              <div className="flex rounded-lg border border-gray-200 p-1">
                <button
                  type="button"
                  onClick={() => setView('map')}
                  aria-label="Map view"
                  className={`rounded-md p-2 ${
                    view === 'map'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <MapIcon size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  aria-label="List view"
                  className={`rounded-md p-2 ${
                    view === 'list'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <List size={17} />
                </button>
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Hazard category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                >
                  <option value="all">All hazard categories</option>
                  {HAZARD_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Flood severity
                </label>
                <select
                  value={selectedSeverity}
                  onChange={(event) => setSelectedSeverity(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                >
                  <option value="all">All severity levels</option>
                  {SEVERITIES.map((severity) => (
                    <option key={severity.value} value={severity.value}>
                      {severity.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900"
                >
                  <X size={14} />
                  Clear filters
                </button>
              </div>
            </div>
          )}
        </div>

        {activeCommunityRisk && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Selected community assessment
                </p>
                <h2 className="mt-1 text-lg font-bold text-gray-900">
                  {activeCommunityRisk.communityName}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {activeCommunityRisk.lga}
                  {activeCommunityRisk.lga && activeCommunityRisk.state ? ', ' : ''}
                  {activeCommunityRisk.state}
                </p>
              </div>
              <span
                className="w-fit rounded-full px-3 py-1.5 text-sm font-semibold capitalize"
                style={{
                  color: getSeverity(activeCommunityRisk.severity).color,
                  backgroundColor: `${getSeverity(activeCommunityRisk.severity).color}18`,
                }}
              >
                {activeCommunityRisk.severity} risk
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-gray-700">
              {activeCommunityRisk.summary}
            </p>

            {activeCommunityRisk.recommendedActions.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-900">
                  Recommended actions
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                  {activeCommunityRisk.recommendedActions.map((action, index) => (
                    <li key={`${activeCommunityRisk.id}-action-${index}`}>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
              <span>Assessed: {formatDate(activeCommunityRisk.assessedAt)}</span>
              <span>Valid until: {formatDate(activeCommunityRisk.validUntil)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {view === 'map' ? 'Map overview' : 'Map reports and assessments'}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedCommunityName} · {totalMapItems} matching item{totalMapItems === 1 ? '' : 's'}
                </p>
              </div>
              <span className="text-xs text-gray-500">
                {filteredHazards.length} hazards · {filteredRisks.length} risk assessments
              </span>
            </div>

            {view === 'map' ? (
              <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                <div className="h-[520px] w-full">
                  <HazardMapCanvas
                    hazards={filteredHazards}
                    risks={filteredRisks}
                    onHazardSelect={(hazard) => {
                      setSelectedHazard(hazard);
                      setSelectedRisk(null);
                    }}
                    onRiskSelect={(risk) => {
                      setSelectedRisk(risk);
                      setSelectedHazard(null);
                    }}
                  />
                </div>

                {loading && (
                  <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/65 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow">
                      <RefreshCw size={16} className="animate-spin" />
                      Updating map data...
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRisks.map((risk) => (
                  <RiskCard
                    key={risk.id}
                    risk={risk}
                    selected={selectedRisk?.id === risk.id}
                    onSelect={() => {
                      setSelectedRisk(risk);
                      setSelectedHazard(null);
                    }}
                  />
                ))}

                {filteredHazards.map((hazard) => (
                  <HazardCard
                    key={hazard.id}
                    hazard={hazard}
                    selected={selectedHazard?.id === hazard.id}
                    onSelect={() => {
                      setSelectedHazard(hazard);
                      setSelectedRisk(null);
                    }}
                  />
                ))}

                {!loading && totalMapItems === 0 && (
                  <EmptyState
                    title="No matching map information"
                    description="There are no verified hazards or active community risk assessments matching your current filters."
                  />
                )}
              </div>
            )}

            {view === 'map' && !loading && totalMapItems === 0 && (
              <EmptyState
                title="No mapped information available"
                description="There are currently no verified hazard reports or active community risk assessments matching this view. This does not mean the area is free from flood risk."
              />
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <Layers3 size={17} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Map legend
                </h3>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Community flood risk
                  </p>
                  <div className="space-y-2.5">
                    {SEVERITIES.map((severity) => (
                      <div
                        key={severity.value}
                        className="flex items-center gap-2.5 text-sm text-gray-700"
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm"
                          style={{ backgroundColor: severity.color }}
                        />
                        {severity.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Verified hazard categories
                  </p>
                  <div className="space-y-2.5">
                    {HAZARD_CATEGORIES.map((category) => (
                      <div
                        key={category.value}
                        className="flex items-center gap-2.5 text-sm text-gray-700"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="mt-4 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500">
                Larger circles represent community-level risk assessments.
                Smaller circles represent individual verified hazard reports.
                A community marker does not identify the exact location of flooding.
              </p>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="font-semibold text-gray-900">Selected information</h3>

              {selectedRisk ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Community risk assessment
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {selectedRisk.communityName}
                    </p>
                    <span
                      className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold capitalize"
                      style={{
                        color: getSeverity(selectedRisk.severity).color,
                        backgroundColor: `${getSeverity(selectedRisk.severity).color}18`,
                      }}
                    >
                      {selectedRisk.severity} risk
                    </span>
                  </div>

                  <p className="text-sm leading-6 text-gray-600">
                    {selectedRisk.summary}
                  </p>

                  <div className="space-y-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
                    <p>Assessed: {formatDate(selectedRisk.assessedAt)}</p>
                    <p>Valid until: {formatDate(selectedRisk.validUntil)}</p>
                    <p>
                      Location: {[selectedRisk.lga, selectedRisk.state].filter(Boolean).join(', ') || 'Not available'}
                    </p>
                  </div>

                  {selectedRisk.recommendedActions.length > 0 && (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-sm font-semibold text-gray-900">
                        Recommended actions
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                        {selectedRisk.recommendedActions.map((action, index) => (
                          <li key={`${selectedRisk.id}-detail-${index}`}>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : selectedHazard ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                      Verified hazard report
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {selectedHazard.title}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {getCategory(selectedHazard.category).label}
                    </p>
                  </div>

                  <p className="text-sm leading-6 text-gray-600">
                    {selectedHazard.description}
                  </p>

                  <div className="space-y-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
                    <p>Community: {selectedHazard.communityName}</p>
                    <p>Reported: {formatDate(selectedHazard.reportedAt)}</p>
                    <p>Verified: {formatDate(selectedHazard.verifiedAt)}</p>
                    {selectedHazard.verifiedByLabel && (
                      <p>Verified by: {selectedHazard.verifiedByLabel}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg bg-gray-50 p-4 text-center">
                  <MapPin className="mx-auto text-gray-400" size={22} />
                  <p className="mt-2 text-sm font-medium text-gray-700">
                    Nothing selected
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Select a marker on the map or an item in the list to see more details.
                  </p>
                </div>
              )}
            </div>

            <CommunityWeather
              communityName={selectedCommunityName}
              latitude={
                selectedCommunity === 'all'
                  ? NIGERIA_CENTER[0]
                  : selectedCommunityData?.latitude ?? null
              }
              longitude={
                selectedCommunity === 'all'
                  ? NIGERIA_CENTER[1]
                  : selectedCommunityData?.longitude ?? null
              }
            />

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  size={18}
                  className="mt-0.5 shrink-0 text-amber-700"
                />
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">
                    Important safety information
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    The absence of a marker or assessment does not mean a
                    community is safe from flooding. Follow official emergency
                    warnings and instructions from relevant authorities.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={14} />
            Verified incidents and predicted risks are displayed separately.
          </span>
          <span>Map tiles © OpenStreetMap contributors</span>
        </div>
      </div>
    </ResidentShell>
  );
}
