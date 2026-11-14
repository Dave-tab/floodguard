
import {
  CloudRain,
  Droplets,
  RefreshCw,
  Thermometer,
  Wind,
} from 'lucide-react';
import type { WeatherContext } from '../../types/resident';
import { UnavailableBlock } from '../../components/ui/DataStateCard';

interface WeatherTelemetryCardProps {
  weather: WeatherContext;
  onRetry?: () => void;
}

function formatValue(value: number | null, suffix: string) {
  return value === null ? 'Unavailable' : `${value}${suffix}`;
}

function formatRetrievedAt(value: string | null) {
  if (!value) return 'Timestamp unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Timestamp unavailable';

  return date.toLocaleString();
}

export function WeatherTelemetryCard({
  weather,
  onRetry,
}: WeatherTelemetryCardProps) {
  const isUnavailable =
    weather.status === 'unavailable' ||
    weather.status === 'insufficient_data';

  if (isUnavailable) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <CloudRain className="h-5 w-5 text-secondary" />
          <h2 className="font-bold text-primary">Weather & Rainfall Context</h2>
        </div>

        <UnavailableBlock
          badgeText="Weather unavailable"
          title="No usable weather data"
          message={
            weather.message ??
            'Weather information has not been connected for this community.'
          }
        />

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </section>
    );
  }

  const stale = weather.status === 'stale';

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CloudRain className="h-5 w-5 text-secondary" />
          <div>
            <h2 className="font-bold text-primary">Weather & Rainfall Context</h2>
            <p className="text-xs text-on-surface-variant">
              Provider: {weather.provider ?? 'Not specified'}
            </p>
          </div>
        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            stale
              ? 'bg-amber-100 text-amber-800'
              : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          {stale ? 'Stale data' : 'Available data'}
        </span>
      </div>

      {weather.isDemoData && (
        <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-800">
          Demonstration data. These values are not live community observations.
        </p>
      )}

      {stale && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          This weather feed may be outdated. Treat the values below as
          historical context, not current conditions.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-container-low p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
            <Droplets className="h-4 w-4 text-secondary" />
            Observed rainfall · 6 hours
          </div>
          <p className="text-2xl font-bold tabular-nums text-primary">
            {formatValue(weather.observedRainfall6hMm, ' mm')}
          </p>
          <p className="mt-1 text-[11px] text-on-surface-variant">
            Recorded rainfall, not forecast rainfall.
          </p>
        </div>

        <div className="rounded-xl bg-surface-container-low p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
            <CloudRain className="h-4 w-4 text-secondary" />
            Forecast rainfall · 24 hours
          </div>
          <p className="text-2xl font-bold tabular-nums text-primary">
            {formatValue(weather.forecastRainfall24hMm, ' mm')}
          </p>
          <p className="mt-1 text-[11px] text-on-surface-variant">
            Forecast estimate, not an observed measurement.
          </p>
        </div>

        <div className="rounded-xl bg-surface-container-low p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
            <Thermometer className="h-4 w-4 text-secondary" />
            Temperature
          </div>
          <p className="text-xl font-bold tabular-nums text-primary">
            {formatValue(weather.temperatureC, '°C')}
          </p>
        </div>

        <div className="rounded-xl bg-surface-container-low p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
            <Wind className="h-4 w-4 text-secondary" />
            Relative humidity
          </div>
          <p className="text-xl font-bold tabular-nums text-primary">
            {formatValue(weather.humidityPct, '%')}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-slate-100 pt-3 text-[11px] text-on-surface-variant">
        <span>Retrieved: {formatRetrievedAt(weather.retrievedAt)}</span>
        {weather.staleLimitHours !== null && (
          <span>Configured freshness limit: {weather.staleLimitHours} hours</span>
        )}
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh weather data
        </button>
      )}
    </section>
  );
}
