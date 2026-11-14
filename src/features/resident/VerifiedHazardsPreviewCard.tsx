
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { VerifiedHazardSummary } from '../../types/resident';

interface VerifiedHazardsPreviewCardProps {
  hazards: VerifiedHazardSummary[];
}

const categoryLabels: Record<string, string> = {
  flooded_road: 'Flooded road',
  rising_water_level: 'Rising water level',
  blocked_drainage: 'Blocked drainage',
  overflowing_waterway: 'Overflowing waterway',
  damaged_drainage: 'Damaged drainage',
  other: 'Other hazard',
};

export function VerifiedHazardsPreviewCard({
  hazards,
}: VerifiedHazardsPreviewCardProps) {
  const verifiedHazards = hazards.filter(
    (hazard) => hazard.status === 'verified',
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-primary">Verified Community Hazards</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Reports reviewed and marked verified.
          </p>
        </div>

        <AlertCircle className="h-5 w-5 text-secondary" />
      </div>

      {verifiedHazards.length === 0 ? (
        <div className="rounded-xl bg-surface-container-low p-4">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-on-surface-variant" />
            <span className="text-xs font-bold text-primary">
              No verified reports available
            </span>
          </div>

          <p className="text-xs leading-relaxed text-on-surface-variant">
            There are currently no verified hazard reports available for
            this community. This does not mean the community is free from
            flooding or other hazards.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {verifiedHazards.slice(0, 3).map((hazard) => (
            <article
              key={hazard.id}
              className="rounded-xl border border-slate-100 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold uppercase text-green-800">
                  Verified
                </span>

                {hazard.isDemoData && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-800">
                    Sample data
                  </span>
                )}
              </div>

              <h3 className="text-sm font-bold text-primary">
                {categoryLabels[hazard.category] ?? 'Hazard report'}
              </h3>

              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                {hazard.description}
              </p>

              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                <Clock className="h-3.5 w-3.5" />
                Reported: {new Date(hazard.reportedAt).toLocaleDateString()}
              </div>
            </article>
          ))}
        </div>
      )}

      <Link
        to="/hazard-map"
        className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-primary hover:text-secondary"
      >
        Explore hazard map
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
