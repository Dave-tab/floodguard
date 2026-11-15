
import type { ReactNode } from 'react';
import {
  Bell,
  Compass,
  Droplets,
  LayoutDashboard,
  Map,
  Menu,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useState } from 'react';

import { AccountMenu } from './AccountMenu';

interface ResidentShellProps {
  children: ReactNode;
  subtitle?: string;
  activeCommunityId?: string;
}

const navigation = [
  {
    label: 'Explore',
    to: '/',
    icon: Compass,
  },
  {
    label: 'Hazard map',
    to: '/hazard-map',
    icon: Map,
  },
  {
    label: 'Report hazard',
    to: '/report-hazard',
    icon: ShieldCheck,
  },
  {
    label: 'Alerts',
    to: '/alerts',
    icon: Bell,
  },
  {
    label: 'My dashboard',
    to: '/dashboard',
    icon: LayoutDashboard,
  },
];

export function ResidentShell({ children }: ResidentShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas text-brand-950">

      {/* TOP NAVIGATION */}
      <header className="sticky top-0 z-50 border-b border-border-soft bg-white/95 backdrop-blur-xl">

        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 md:px-8">

          {/* BRAND */}
          <Link
            to="/"
            className="group flex items-center gap-3"
            aria-label="FloodGuard home"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-950 text-white shadow-md shadow-brand-950/10 transition group-hover:bg-brand-800">
              <Droplets className="h-6 w-6" />
            </div>

            <div>
              <span className="block text-lg font-extrabold tracking-tight text-brand-950">
                FloodGuard
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-600">
                Know. Prepare. Protect.
              </span>
            </div>
          </Link>

          {/* DESKTOP NAVIGATION */}
          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Main navigation"
          >
            {navigation.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-text-secondary hover:bg-canvas hover:text-brand-950'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {/* DESKTOP ACTION */}
          <div className="hidden items-center gap-3 lg:flex">
            <AccountMenu variant="desktop" />
          </div>

          {/* MOBILE MENU BUTTON */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-soft text-brand-950 transition hover:bg-brand-50 lg:hidden"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* MOBILE NAVIGATION */}
        {mobileMenuOpen && (
          <div className="border-t border-border-soft bg-white px-5 py-4 lg:hidden">
            <nav
              className="mx-auto flex max-w-7xl flex-col gap-1"
              aria-label="Mobile navigation"
            >
              {navigation.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                        isActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-text-secondary hover:bg-canvas'
                      }`
                    }
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            <div className="mx-auto mt-4 max-w-7xl border-t border-border-soft pt-4">
              <AccountMenu
                variant="mobile"
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </div>
          </div>
        )}
      </header>

      {/* PAGE CONTENT */}
      <div className="min-h-[60vh]">
        {children}
      </div>

      {/* FOOTER */}
      <footer className="border-t border-border-soft bg-white">

        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-2 md:px-8 lg:grid-cols-4">

          <div className="lg:col-span-2">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-950 text-white">
                <Droplets className="h-5 w-5" />
              </div>

              <span className="text-lg font-extrabold tracking-tight text-brand-950">
                FloodGuard
              </span>
            </Link>

            <p className="mt-4 max-w-sm text-sm leading-7 text-text-secondary">
              Community-powered flood awareness and preparedness.
              Helping people understand available environmental
              information and prepare before flooding happens.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-brand-950">
              Explore
            </h3>

            <div className="mt-4 flex flex-col gap-3 text-sm text-text-secondary">
              <Link to="/" className="hover:text-brand-600">
                Discover communities
              </Link>
              <Link to="/hazard-map" className="hover:text-brand-600">
                Hazard map
              </Link>
              <Link to="/alerts" className="hover:text-brand-600">
                Public alerts
              </Link>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-brand-950">
              About the platform
            </h3>

            <div className="mt-4 flex flex-col gap-3 text-sm text-text-secondary">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-600" />
                Community participation
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                Risk awareness
              </span>
              <span className="flex items-center gap-2">
                <Droplets className="h-4 w-4 text-brand-600" />
                Flood preparedness
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-border-soft">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-text-secondary md:flex-row md:items-center md:justify-between md:px-8">
            <p>
              © {new Date().getFullYear()} FloodGuard AI.
              Community awareness through accessible information.
            </p>

            <p>
              Know the Risk. Prepare Before It Happens.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
