import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  LayoutDashboard,
  MapPinned,
  Radio,
} from 'lucide-react';

const navigation = [
  {
    label: 'Dashboard',
    description: 'Monitoring overview',
    path: '/admin',
    icon: LayoutDashboard,
    end: true,
  },
  {
    label: 'Hazard reports',
    description: 'Review community reports',
    path: '/admin/reports',
    icon: AlertTriangle,
  },
  {
    label: 'Community risk',
    description: 'Review risk assessments',
    path: '/admin/communities',
    icon: MapPinned,
  },
  {
    label: 'Emergency broadcasts',
    description: 'Prepare community notices',
    path: '/admin/broadcast',
    icon: Radio,
  },
];

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-canvas text-brand-950 lg:flex">
      <aside className="hidden w-72 shrink-0 border-r border-border-soft bg-surface lg:flex lg:flex-col">
        <div className="border-b border-border-soft px-6 py-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white">
              <Activity size={22} />
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight">
                FloodGuard
              </p>
              <p className="text-xs font-medium text-text-secondary">
                Administration
              </p>
            </div>
          </div>
        </div>

        <nav aria-label="Admin navigation" className="flex-1 space-y-2 p-4">
          <p className="px-3 pb-2 pt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-text-secondary">
            Workspace
          </p>

          {navigation.map(({ label, description, path, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-3 transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-text-secondary hover:bg-canvas hover:text-brand-950'
                }`
              }
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
                <Icon size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{label}</span>
                <span className="mt-0.5 block text-xs text-text-secondary">
                  {description}
                </span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border-soft p-5">
          <p className="text-xs leading-5 text-text-secondary">
            FloodGuard AI monitoring workspace. Administrative access must be
            enforced by the backend before production use.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-border-soft bg-surface px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">
                  FloodGuard AI
                </p>
                <h1 className="mt-1 text-lg font-extrabold tracking-tight text-brand-950">
                  Admin workspace
                </h1>
              </div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                Frontend preview
              </span>
            </div>

            <nav
              aria-label="Mobile admin navigation"
              className="grid grid-cols-4 gap-2 lg:hidden"
            >
              {navigation.map(({ label, path, icon: Icon, end }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={end}
                  className={({ isActive }) =>
                    `flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-[10px] font-bold ${
                      isActive
                        ? 'bg-brand-50 text-brand-800'
                        : 'text-text-secondary hover:bg-canvas'
                    }`
                  }
                >
                  <Icon size={19} />
                  <span className="w-full truncate">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
