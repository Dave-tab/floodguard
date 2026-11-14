import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Droplets, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from './useAuth';

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

  const destination =
    (location.state as { from?: { pathname?: string } } | null)
      ?.from?.pathname ?? '/';

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
        const result = await signUp(displayName, email.trim(), password);

        if (result.needsEmailConfirmation) {
          setMessage(
            'Your account request was received. Check your email for a confirmation link before signing in.',
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
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      );
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
