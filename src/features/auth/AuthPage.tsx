import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Droplets, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from './useAuth';
import {
  RESUME_PATH,
  browserStorage,
  loadDraft,
  safeInternalPath,
} from '../resident/reportDraft';

type AuthMode = 'login' | 'register';

interface AuthPageProps {
  initialMode: AuthMode;
}

export function AuthPage({ initialMode }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const { signIn, signUp, configured, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchParams] = useSearchParams();
  // A report saved on this device by a signed-out visitor (see reportDraft.ts).
  const [hasDraft] = useState(() => loadDraft(browserStorage(), new Date()) !== null);

  // Where to go after signing in: the page that sent the user here (router state or a
  // same-site ?from= link), else their saved report, else their dashboard.
  const stateFrom = (location.state as {
    from?: { pathname?: string; search?: string };
  } | null)?.from;
  const statePath = stateFrom?.pathname
    ? `${stateFrom.pathname}${stateFrom.search ?? ''}`
    : null;
  const queryFrom = safeInternalPath(searchParams.get('from'));
  const queryPath =
    queryFrom && searchParams.get('resume') === '1' && !queryFrom.includes('?')
      ? `${queryFrom}?resume=1`
      : queryFrom;
  const explicitDestination = statePath ?? queryPath;
  const fallbackDestination = hasDraft ? RESUME_PATH : '/dashboard';
  const destination = explicitDestination ?? fallbackDestination;
  const returningToDraft = destination === RESUME_PATH;

 useEffect(() => {
  if (user) {
    navigate(destination, { replace: true });
  }
}, [user, navigate, destination]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!configured) {
      setError('Authentication is not connected yet. Configure your Supabase project first.');
      return;
    }

    if (mode === 'register') {
      if (displayName.trim().length < 2) {
        setError('Please enter your full name.');
        return;
      }

      if (password.length < 8) {
        setError('Your password must contain at least 8 characters.');
        return;
      }

      if (password !== confirmPassword) {
        setError('Your passwords do not match.');
        return;
      }
    }

    setSubmitting(true);

    try {
      if (mode === 'register') {
        // The confirmation link brings the user back to sign-in, then on to `destination`.
        const redirectPath =
          destination === '/dashboard'
            ? '/login'
            : `/login?from=${encodeURIComponent(destination)}`;
        const result = await signUp(displayName, email.trim(), password, {
          redirectPath,
        });

        if (result.needsEmailConfirmation) {
          setMessage(
            returningToDraft
              ? `Almost done: we sent a confirmation link to ${email.trim()}. Open it to activate your account, then sign in. Your report is still saved on this device and has not been sent yet: after you sign in you will be taken back to it to submit.`
              : `Almost done: we sent a confirmation link to ${email.trim()}. Open it to activate your account, then sign in here. You are not signed in yet.`,
          );
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        } else {
          navigate(destination, { replace: true });
        }
      } else {
        await signIn(email.trim(), password);
        navigate(destination, { replace: true });
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : '';
      if (/email not confirmed/i.test(text)) {
        setError(
          'Your email address is not confirmed yet. Open the confirmation link we sent you, then sign in again.',
        );
      } else if (/invalid login credentials/i.test(text)) {
        setError('The email or password is incorrect.');
      } else {
        setError(text || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[80vh] px-5 py-12 md:py-16">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-border-soft bg-white shadow-sm lg:grid-cols-2">

        <section className="bg-brand-950 px-7 py-10 text-white md:px-10 md:py-14">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-white/75 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to FloodGuard
          </Link>

          <div className="mt-16 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <Droplets className="h-8 w-8" />
          </div>

          <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-teal-300">
            Know. Prepare. Protect.
          </p>

          <h1 className="mt-4 max-w-sm text-3xl font-extrabold leading-tight md:text-4xl">
            Stronger communities start with informed people.
          </h1>

          <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">
            Join FloodGuard to share local observations, follow
            community updates and help improve flood awareness.
          </p>

          <div className="mt-10 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <ShieldCheck className="h-6 w-6 shrink-0 text-teal-300" />
            <p className="text-xs leading-6 text-white/75">
              Only registered and authenticated residents can
              submit hazard reports.
            </p>
          </div>
        </section>

        <section className="px-7 py-10 md:px-10 md:py-14">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
              Resident account
            </p>

            <h2 className="mt-3 text-2xl font-extrabold text-brand-950">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>

            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {mode === 'login'
                ? 'Sign in to access your resident account.'
                : 'Register to participate in your community.'}
            </p>
          </div>

          {!configured && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Supabase is not connected yet. Authentication will
              become available after project configuration.
            </div>
          )}

          {returningToDraft && !message && (
            <div role="status" className="mb-5 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm leading-6 text-brand-900">
              Your hazard report is saved on this device but has not been sent yet. Sign in or
              create an account, then you will be taken back to it to submit.
            </div>
          )}

          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
              {error}
            </div>
          )}

          {message && (
            <div role="status" className="mb-5 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-800">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'register' && (
              <div>
                <label htmlFor="displayName" className="mb-2 block text-sm font-semibold text-brand-950">
                  Full name
                </label>
                <input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Enter your full name"
                  className="w-full rounded-xl border border-border-soft bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-brand-950">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-border-soft bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-brand-950">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-border-soft bg-white px-4 py-3 pr-12 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-brand-950"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-brand-950">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Enter your password again"
                  className="w-full rounded-xl border border-border-soft bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={!configured || submitting}
              className="w-full rounded-xl bg-brand-950 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create resident account'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-text-secondary">
            {mode === 'login'
              ? "Don't have an account?"
              : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
                setMessage('');
              }}
              className="font-bold text-brand-700 hover:text-brand-950"
            >
              {mode === 'login' ? 'Register' : 'Sign in'}
            </button>
          </p>
        </section>
      </div>
    </main>
  );
}
