
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Plus,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { ResidentShell } from '../../components/layout/ResidentShell';

const STATUS_ITEMS = [
  {
    label: 'Pending',
    description: 'Awaiting administrator review',
    icon: Clock3,
    iconStyle: 'bg-amber-50 text-amber-700',
  },
  {
    label: 'Verified',
    description: 'Confirmed by an administrator',
    icon: CheckCircle2,
    iconStyle: 'bg-green-50 text-green-700',
  },
  {
    label: 'Rejected',
    description: 'Not approved after review',
    icon: XCircle,
    iconStyle: 'bg-red-50 text-red-700',
  },
];

export function MyActivityPage() {
  return (
    <ResidentShell subtitle="My Activity">
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Explore
        </Link>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-secondary">
              <FileText className="h-4 w-4" />
              Your reporting history
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-primary">
              My Activity
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
              Keep track of the hazard reports you submit and follow
              their review progress.
            </p>
          </div>

          <Link
            to="/report-hazard"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Submit a report
          </Link>
        </div>

        {/* Report status overview */}
        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-primary">
              Report overview
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              A summary of the reports submitted through your account.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {STATUS_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.label}
                  className="rounded-xl border border-border-soft bg-surface-container-lowest p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-text-secondary">
                      {item.label}
                    </span>

                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.iconStyle}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>

                  <p className="mt-4 text-2xl font-bold text-primary">
                    —
                  </p>

                  <p className="mt-1 text-xs text-text-secondary">
                    {item.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Personal report history */}
        <section className="overflow-hidden rounded-xl border border-border-soft bg-surface-container-lowest shadow-sm">
          <div className="border-b border-border-soft p-5">
            <h2 className="text-lg font-bold text-primary">
              Your hazard reports
            </h2>

            <p className="mt-1 text-sm text-text-secondary">
              View your submissions and monitor their review status.
            </p>
          </div>

          <div className="px-5 py-14 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
              <FileText className="h-7 w-7 text-secondary" />
            </div>

            <h3 className="text-lg font-bold text-primary">
              No report history available yet
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
              Your submitted hazard reports will appear here. You'll
              be able to track their status, view report details and
              read updates from administrators.
            </p>

            <Link
              to="/report-hazard"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
            >
              Submit your first report
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Privacy information */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border-soft bg-surface-container-low p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />

          <div>
            <h3 className="text-sm font-semibold text-primary">
              Your reports are account-specific
            </h3>

            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              Your report history is intended to be visible only to
              you and authorised administrators. Report verification
              and status updates are handled through the platform's
              authorised review process.
            </p>
          </div>
        </div>
      </main>
    </ResidentShell>
  );
}
