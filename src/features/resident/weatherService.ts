export interface WeatherCoordinates {
  latitude: number;
  longitude: number;
}

export interface HourlyWeather {
  time: string;
  temperature: number | null;
  precipitationProbability: number | null;
  precipitation: number | null;
  weatherCode: number | null;
}

export interface CurrentWeather {
  time: string;
  temperature: number | null;
  precipitation: number | null;
  weatherCode: number | null;
}

export interface CommunityWeather {
  location: WeatherCoordinates;
  timezone: string;
  current: CurrentWeather;
  hourly: HourlyWeather[];
  provider: 'Open-Meteo';
  providerUrl: string;
  fetchedAt: string;
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current?: {
    time: string;
    temperature_2m?: number;
    precipitation?: number;
    weather_code?: number;
  };
  hourly?: {
    time: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    precipitation?: number[];
    weather_code?: number[];
  };
}

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

function isValidCoordinate(value: number): boolean {
  return Number.isFinite(value);
}

function getNullableValue(
  values: number[] | undefined,
  index: number,
): number | null {
  const value = values?.[index];

  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : null;
}

export async function getCommunityWeather(
  coordinates: WeatherCoordinates,
): Promise<CommunityWeather> {
  const { latitude, longitude } = coordinates;

  if (
    !isValidCoordinate(latitude) ||
    !isValidCoordinate(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('Valid community coordinates are required.');
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,precipitation,weather_code',
    hourly:
      'temperature_2m,precipitation_probability,precipitation,weather_code',
    forecast_hours: '24',
    timezone: 'Africa/Lagos',
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
  });

  const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(
      `Weather provider request failed (${response.status}).`,
    );
  }

  const data = (await response.json()) as OpenMeteoResponse;

  if (!data.current?.time || !data.hourly?.time) {
    throw new Error('The weather provider returned incomplete data.');
  }

  const hourly: HourlyWeather[] = data.hourly.time.map((time, index) => ({
    time,
    temperature: getNullableValue(
      data.hourly?.temperature_2m,
      index,
    ),
    precipitationProbability: getNullableValue(
      data.hourly?.precipitation_probability,
      index,
    ),
    precipitation: getNullableValue(
      data.hourly?.precipitation,
      index,
    ),
    weatherCode: getNullableValue(
      data.hourly?.weather_code,
      index,
    ),
  }));

  return {
    location: {
      latitude: data.latitude,
      longitude: data.longitude,
    },
    timezone: data.timezone || 'Africa/Lagos',
    current: {
      time: data.current.time,
      temperature:
        typeof data.current.temperature_2m === 'number'
          ? data.current.temperature_2m
          : null,
      precipitation:
        typeof data.current.precipitation === 'number'
          ? data.current.precipitation
          : null,
      weatherCode:
        typeof data.current.weather_code === 'number'
          ? data.current.weather_code
          : null,
    },
    hourly,
    provider: 'Open-Meteo',
    providerUrl: 'https://open-meteo.com/',
    fetchedAt: new Date().toISOString(),
  };
}