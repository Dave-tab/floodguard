
import { Link } from 'react-router-dom';
import { ArrowLeft, Compass, Shield } from 'lucide-react';
import { ResidentShell } from '../../components/layout/ResidentShell';

interface ModulePlaceholderPageProps {
  subtitle: string;
  title: string;
  description: string;
  ownerLabel: string;
}

export function ModulePlaceholderPage({
  subtitle,
  title,
  description,
  ownerLabel,
}: ModulePlaceholderPageProps) {
  return (
    <ResidentShell subtitle={subtitle}>
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200/70 bg-surface-container-lowest p-6 shadow-sm">
          <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-surface-container px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Shield
              className="h-3.5 w-3.5 text-secondary"
              aria-hidden="true"
            />
            <span>{ownerLabel}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold text-primary">
              {title}
            </h1>

            <p className="text-sm leading-relaxed text-on-surface-variant">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-surface-tint"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Explore</span>
            </Link>

            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg bg-surface-container px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-surface-container-high"
            >
              <Compass
                className="h-4 w-4 text-secondary"
                aria-hidden="true"
              />
              <span>Discover Communities</span>
            </Link>
          </div>
        </div>
      </div>
    </ResidentShell>
  );
}
