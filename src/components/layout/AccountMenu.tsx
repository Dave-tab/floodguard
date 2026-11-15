import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ChevronDown,
  LayoutDashboard,
  LogIn,
  LogOut,
  ShieldCheck,
  UserPlus,
  UserRound,
} from 'lucide-react';

import { useAuth } from '../../features/auth/useAuth';
import { useCurrentUser } from '../../features/auth/useCurrentUser';

interface AccountMenuProps {
  variant: 'desktop' | 'mobile';
  /** Called after any navigation (closes the mobile menu). */
  onNavigate?: () => void;
}

const itemClass =
  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand-950 transition hover:bg-brand-50 focus:bg-brand-50 focus:outline-none';

export function AccountMenu({ variant, onNavigate }: Readonly<AccountMenuProps>) {
  const { signOut, configured } = useAuth();
  const { authLoading, signedIn, me, email } = useCurrentUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const done = () => {
    setOpen(false);
    onNavigate?.();
  };

  const handleSignOut = async () => {
    setSignOutError('');
    try {
      await signOut();
      done();
      navigate('/');
    } catch (error: unknown) {
      setSignOutError(
        error instanceof Error ? error.message : 'Unable to sign out. Please try again.',
      );
    }
  };

  if (authLoading) {
    return <span className="text-xs text-text-secondary">Checking account…</span>;
  }

  if (!signedIn) {
    if (!configured) return null;
    return (
      <div className={variant === 'desktop' ? 'flex items-center gap-2' : 'flex flex-col gap-2'}>
        <Link
          to="/login"
          onClick={done}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-brand-950 transition hover:bg-brand-50"
        >
          <LogIn className="h-4 w-4" />
          Sign in
        </Link>
        <Link
          to="/register"
          onClick={done}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-800"
        >
          <UserPlus className="h-4 w-4" />
          Register
        </Link>
      </div>
    );
  }

  const displayName = me?.fullName?.trim() || me?.email || email || 'My account';
  const isAdmin = me?.role === 'admin';

  const items = (
    <>
      <Link to="/dashboard" onClick={done} className={itemClass} role="menuitem">
        <LayoutDashboard className="h-4 w-4 text-brand-600" />
        My dashboard
      </Link>
      <Link to="/my-activity" onClick={done} className={itemClass} role="menuitem">
        <Activity className="h-4 w-4 text-brand-600" />
        My reports
      </Link>
      {isAdmin && (
        <Link to="/admin" onClick={done} className={itemClass} role="menuitem">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          Admin dashboard
        </Link>
      )}
      <button
        type="button"
        onClick={() => void handleSignOut()}
        className={`${itemClass} text-red-700 hover:bg-red-50 focus:bg-red-50`}
        role="menuitem"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
      {signOutError && (
        <p className="px-3 pt-1 text-xs font-semibold text-red-700" role="alert">
          {signOutError}
        </p>
      )}
    </>
  );

  if (variant === 'mobile') {
    return (
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 px-3 pb-1 text-xs font-semibold text-text-secondary">
          <UserRound className="h-4 w-4" />
          Signed in as {displayName}
        </p>
        <div role="menu" aria-label="Account">
          {items}
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex max-w-[220px] items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-2 text-[11px] font-semibold text-brand-800 transition hover:bg-brand-100"
      >
        <UserRound className="h-4 w-4 shrink-0" />
        <span className="truncate">{displayName}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-60 rounded-2xl border border-border-soft bg-white p-2 shadow-lg"
        >
          <p className="truncate px-3 pb-2 pt-1 text-xs text-text-secondary">
            Signed in as <span className="font-semibold text-brand-950">{displayName}</span>
          </p>
          {items}
        </div>
      )}
    </div>
  );
}
