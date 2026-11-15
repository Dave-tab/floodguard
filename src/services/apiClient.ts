import { supabase } from '../lib/supabase';

/**
 * FloodGuard API client. The browser only talks to Supabase for sign-in; every data
 * operation that needs authorisation (reports, admin) goes through the API, which checks
 * the Supabase access token and the user's role on the server.
 */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

const API_BASE_URL = trimTrailingSlashes(import.meta.env.VITE_API_BASE_URL ?? '');

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isApiConfigured(): boolean {
  return API_BASE_URL !== '';
}

async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  /** When true the request fails with 401 before sending if nobody is signed in. */
  requireAuth?: boolean;
  signal?: AbortSignal;
}

/** Calls the API and returns `data` from a `{ data }` envelope (or the raw body). */
export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, requireAuth = false, signal }: ApiRequestOptions = {},
): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError('The FloodGuard API is not configured.', 0);
  }

  const token = await getAccessToken();

  if (requireAuth && !token) {
    throw new ApiError('Please sign in to continue.', 401);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      'Unable to reach FloodGuard. Check your connection and try again.',
      0,
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : `FloodGuard API request failed (${response.status}).`;

    throw new ApiError(message, response.status);
  }

  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}
