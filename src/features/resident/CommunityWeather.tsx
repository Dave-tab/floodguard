import { useEffect, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  RefreshCw,
  Sun,
  CloudSun,
  CloudSnow,
  Droplets,
  Thermometer,
  Clock,
  MapPin,
} from 'lucide-react';

import {
  getCommunityWeather,
  type CommunityWeather as CommunityWeatherData,
} from './weatherService';

interface CommunityWeatherProps {
  communityName: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

type WeatherResult =
  | {
      key: string;
      data: CommunityWeatherData;
      error: null;
    }
  | {
      key: string;
      data: null;
      error: string;
    };

function getWeatherDescription(code: number | null): string {
  if (code === null) return 'Condition unavailable';

  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';

  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';

  return 'Unknown condition';
}

function WeatherIcon({ code }: { code: number | null }) {
  if (code === null) return <Cloud className="h-8 w-8" />;

  if (code === 0) return <Sun className="h-8 w-8" />;
  if (code === 1 || code === 2) {
    return <CloudSun className="h-8 w-8" />;
  }
  if (code === 45 || code === 48) {
    return <CloudFog className="h-8 w-8" />;
  }
  if (code >= 51 && code <= 57) {
    return <CloudDrizzle className="h-8 w-8" />;
  }
  if (code >= 61 && code <= 67) {
    return <CloudRain className="h-8 w-8" />;
  }
  if (code >= 71 && code <= 86) {
    return <CloudSnow className="h-8 w-8" />;
  }
  if (code >= 95) {
    return <CloudLightning className="h-8 w-8" />;
  }

  return <Cloud className="h-8 w-8" />;
}

function formatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '--';

  return new Intl.DateTimeFormat('en-NG', {
    hour: 'numeric',
    hour12: true,
    timeZone: 'Africa/Lagos',
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Unavailable';

  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Lagos',
  }).format(date);
}

function formatMeasurement(
  value: number | null,
  suffix: string,
): string {
  return value === null ? '—' : `${value.toFixed(1)}${suffix}`;
}

export default function CommunityWeather({
  communityName,
  latitude,
  longitude,
}: CommunityWeatherProps) {
  const [result, setResult] = useState<WeatherResult | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const hasCoordinates =
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude);

  const coordinatesKey = hasCoordinates
    ? `${latitude},${longitude}`
    : 'unavailable';

  useEffect(() => {
    if (!hasCoordinates || latitude === null || longitude === null) {
      return;
    }

    let cancelled = false;
    const key = `${latitude},${longitude}`;

    getCommunityWeather({ latitude, longitude })
      .then((data) => {
        if (!cancelled) {
          setResult({ key, data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResult({
            key,
            data: null,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to retrieve weather information.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasCoordinates, latitude, longitude, refreshKey]);

  if (!hasCoordinates) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-slate-500" />
          <h2 className="font-semibold text-slate-900">
            Community weather
          </h2>
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 p-5 text-center">
          <MapPin className="mx-auto h-7 w-7 text-slate-400" />
          <p className="mt-3 font-medium text-slate-800">
            Community location unavailable
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Weather cannot be retrieved until the backend provides
            verified coordinates for this community.
          </p>
        </div>
      </section>
    );
  }

  const currentResult =
    result?.key === coordinatesKey ? result : null;

  if (!currentResult) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">
              Community weather
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {communityName}
            </p>
          </div>
          <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Retrieving the latest weather forecast...
        </p>
      </section>
    );
  }

  if (currentResult.error || !currentResult.data) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">
              Community weather
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {communityName}
            </p>
          </div>
          <Cloud className="h-6 w-6 text-slate-400" />
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">
            Weather data unavailable
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {currentResult.error}
          </p>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-amber-900 hover:underline"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </section>
    );
  }

  const weather = currentResult.data;
  const forecast = weather.hourly.slice(0, 12);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-sky-600" />
            <h2 className="font-semibold text-slate-900">
              Community weather
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {communityName}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-sky-50 p-4">
          <p className="text-sm font-medium text-sky-800">
            Current conditions
          </p>

          <div className="mt-3 flex items-center gap-4">
            <div className="text-sky-700">
              <WeatherIcon code={weather.current.weatherCode} />
            </div>

            <div>
              <p className="text-3xl font-semibold text-slate-900">
                {formatMeasurement(
                  weather.current.temperature,
                  '°C',
                )}
              </p>
              <p className="text-sm text-slate-600">
                {getWeatherDescription(weather.current.weatherCode)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
            <Clock className="h-4 w-4" />
            Valid at {formatTime(weather.current.time)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <Thermometer className="h-5 w-5 text-orange-500" />
            <p className="mt-3 text-xs text-slate-500">
              Temperature
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {formatMeasurement(
                weather.current.temperature,
                '°C',
              )}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <Droplets className="h-5 w-5 text-sky-600" />
            <p className="mt-3 text-xs text-slate-500">
              Current precipitation
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {formatMeasurement(
                weather.current.precipitation,
                ' mm',
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">
              Hourly forecast
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Expected conditions over the next 12 hours
            </p>
          </div>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
            24-hour data retrieved
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {forecast.map((hour) => (
            <div
              key={hour.time}
              className="rounded-xl border border-slate-200 p-3"
            >
              <p className="text-xs font-medium text-slate-500">
                {formatTime(hour.time)}
              </p>

              <div className="my-3 flex items-center gap-2 text-sky-600">
                <WeatherIcon code={hour.weatherCode} />
                <span className="text-sm font-semibold text-slate-800">
                  {formatMeasurement(hour.temperature, '°C')}
                </span>
              </div>

              <div className="space-y-1 text-xs text-slate-600">
                <p>
                  Rain chance:{' '}
                  <strong className="text-slate-900">
                    {hour.precipitationProbability === null
                      ? '—'
                      : `${hour.precipitationProbability}%`}
                  </strong>
                </p>
                <p>
                  Precipitation:{' '}
                  <strong className="text-slate-900">
                    {formatMeasurement(hour.precipitation, ' mm')}
                  </strong>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>
            Forecast retrieved: {formatDateTime(weather.fetchedAt)}
          </span>
          <span>
            Source:{' '}
            <a
              href={weather.providerUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-sky-700 hover:underline"
            >
              Open-Meteo
            </a>
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Weather forecasts are informational and do not independently
          determine community flood-risk severity.
        </p>
      </div>
    </section>
  );
}