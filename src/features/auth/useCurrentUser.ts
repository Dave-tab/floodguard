import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { getCurrentUser, type CurrentUser } from '../../services/reportService';
import { useAuth } from './useAuth';

/**
 * The signed-in user's FloodGuard profile (GET /me), fetched once per session and shared by
 * every component that needs it (header menu, admin guard, dashboard). The role shown here
 * is only for the interface; the API enforces it on every request.
 */
type Status = 'loading' | 'ready' | 'error';

interface Entry {
  userId: string;
  status: Status;
  me: CurrentUser | null;
  error: string | null;
}

let entry: Entry | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return entry;
}

function load(userId: string) {
  const previous = entry?.userId === userId ? entry.me : null;
  entry = { userId, status: 'loading', me: previous, error: null };
  emit();

  getCurrentUser()
    .then((me) => {
      if (entry?.userId !== userId) return;
      entry = { userId, status: 'ready', me, error: null };
      emit();
    })
    .catch((error: unknown) => {
      if (entry?.userId !== userId) return;
      entry = {
        userId,
        status: 'error',
        me: previous,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load your account details.',
      };
      emit();
    });
}

/** Updates the shared profile after a successful change (e.g. a new preferred community). */
export function patchCurrentUser(changes: Partial<CurrentUser>) {
  if (!entry?.me) return;
  entry = { ...entry, me: { ...entry.me, ...changes } };
  emit();
}

export function useCurrentUser() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (userId && entry?.userId !== userId) load(userId);
  }, [userId]);

  const refresh = useCallback(() => {
    if (userId) load(userId);
  }, [userId]);

  const current = userId && snapshot?.userId === userId ? snapshot : null;
  let status: Status | 'signed_out' = 'signed_out';
  if (userId) status = current?.status ?? 'loading';

  return {
    authLoading,
    signedIn: userId !== null,
    status,
    me: current?.me ?? null,
    error: current?.error ?? null,
    email: user?.email ?? null,
    refresh,
  };
}
