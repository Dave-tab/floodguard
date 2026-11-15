import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

import { getCurrentUser } from '../../services/reportService';
import { useAuth } from './useAuth';

type AdminCheck =
  | { state: 'checking' }
  | { state: 'admin' }
  | { state: 'denied' }
  | { state: 'error'; message: string };

function CenteredMessage({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-canvas px-5">
      <div className="max-w-md rounded-3xl border border-border-soft bg-surface p-8 text-center shadow-sm">
        {children}
      </div>
    </main>
  );
}

/**
 * Shows admin pages only to signed-in users whose profile role is admin. This is a
 * convenience for the interface: the API enforces the same rule on every admin request.
 */
export function AdminRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [check, setCheck] = useState<AdminCheck>({ state: 'checking' });
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let active = true;

    getCurrentUser()
      .then((me) => {
        if (active) setCheck(me.role === 'admin' ? { state: 'admin' } : { state: 'denied' });
      })
      .catch((error: unknown) => {
        if (active) {
          setCheck({
            state: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Unable to confirm your account role.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [userId]);

  if (loading) {
    return (
      <CenteredMessage>
        <p className="text-sm text-text-secondary">Checking your account…</p>
      </CenteredMessage>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (check.state === 'checking') {
    return (
      <CenteredMessage>
        <p className="text-sm text-text-secondary">Confirming administrator access…</p>
      </CenteredMessage>
    );
  }

  if (check.state === 'admin') return <>{children}</>;

  return (
    <CenteredMessage>
      <ShieldAlert className="mx-auto h-10 w-10 text-amber-600" />
      <h1 className="mt-4 text-xl font-extrabold text-brand-950">
        {check.state === 'denied'
          ? 'Administrator access required'
          : 'Unable to confirm access'}
      </h1>
      <p className="mt-3 text-sm leading-6 text-text-secondary">
        {check.state === 'denied'
          ? 'Your account does not have administrator access. Administrator roles are assigned by the FloodGuard team.'
          : check.message}
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-xl bg-brand-950 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800"
      >
        Back to FloodGuard
      </Link>
    </CenteredMessage>
  );
}
