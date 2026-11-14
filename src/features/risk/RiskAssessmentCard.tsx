
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  CloudRain,
  Droplets,
  Info,
  Mountain,
  ShieldAlert,
} from 'lucide-react';

import type {
  RiskAssessment,
  RiskFactorItem,
  RiskLevel,
} from '../../types/resident';

interface RiskAssessmentCardProps {
  risk: RiskAssessment;
}

const levelStyles: Record<
  RiskLevel,
  { label: string; classes: string }
> = {
  low: {
    label: 'Low',
    classes: 'bg-green-100 text-green-800',
  },
  moderate: {
    label: 'Moderate',
    classes: 'bg-amber-100 text-amber-800',
  },
  high: {
    label: 'High',
    classes: 'bg-orange-100 text-orange-800',
  },
  critical: {
    label: 'Critical',
    classes: 'bg-red-100 text-red-800',
  },
};

function FactorIcon({ factor }: { factor: RiskFactorItem }) {
  const className = 'h-4 w-4 text-secondary';

  switch (factor.iconKey) {
    case 'rainfall':
      return <CloudRain className={className} />;
    case 'water_level':
      return <Droplets className={className} />;
    case 'drainage':
      return <ShieldAlert className={className} />;
    case 'terrain':
      return <Mountain className={className} />;
    default:
      return <Info className={className} />;
  }
}

export function RiskAssessmentCard({
  risk,
}: RiskAssessmentCardProps) {
  const available =
    risk.status === 'available' && risk.level !== null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-secondary" />
        <h2 className="font-bold text-primary">Community Risk Assessment</h2>
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
          <p className="text-xs leading-relaxed text-amber-900">
            Prototype assessment only. This is not an official flood warning
            or a scientifically validated prediction.
          </p>
        </div>
      </div>

      {risk.isDemoData && (
        <p className="mb-4 rounded-lg bg-surface-container p-2.5 text-xs font-semibold text-on-surface-variant">
          Demonstration assessment — not a live operational result.
        </p>
      )}

      {!available ? (
        <div className="rounded-xl bg-surface-container-low p-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-700">
            <Info className="h-3 w-3" />
            {risk.status === 'insufficient_data'
              ? 'Insufficient data'
              : 'Assessment unavailable'}
          </span>

          <h3 className="mt-3 text-base font-bold text-primary">
            No reliable risk level can be displayed
          </h3>

          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            {risk.summary ??
              'The required information is not currently available for an assessment.'}
          </p>

          {risk.missingInputs.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-bold text-primary">
                Missing information
              </h4>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-on-surface-variant">
                {risk.missingInputs.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-surface-container-low p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-on-surface-variant">
                  Assessment level
                </p>
                <p className="mt-1 text-2xl font-extrabold text-primary">
                  {levelStyles[risk.level!].label}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${levelStyles[risk.level!].classes}`}
              >
                {levelStyles[risk.level!].label} risk
              </span>
            </div>

            {risk.score !== null && (
              <p className="mt-3 text-xs text-on-surface-variant">
                Prototype score: {risk.score}
              </p>
            )}

            {risk.summary && (
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                {risk.summary}
              </p>
            )}
          </div>

          {risk.factors.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-3 text-sm font-bold text-primary">
                Assessment factors
              </h3>

              <div className="flex flex-col gap-3">
                {risk.factors.map((factor) => (
                  <div
                    key={factor.id}
                    className="flex items-start gap-3 rounded-lg border border-slate-100 p-3"
                  >
                    <div className="rounded-lg bg-surface-container p-2">
                      <FactorIcon factor={factor} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <h4 className="text-xs font-bold text-primary">
                          {factor.label}
                        </h4>

                        {factor.value !== null && (
                          <span className="text-xs font-semibold text-primary">
                            {factor.value}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                        {factor.description}
                      </p>

                      {factor.contributionLabel && (
                        <p className="mt-1 text-[11px] text-on-surface-variant">
                          {factor.contributionLabel}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {risk.explanation && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="mb-2 flex items-center gap-2">
            {risk.explanationStatus === 'ai' ? (
              <Brain className="h-4 w-4 text-secondary" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-secondary" />
            )}

            <h3 className="text-xs font-bold text-primary">
              {risk.explanationStatus === 'ai'
                ? 'AI-assisted explanation'
                : 'Assessment explanation'}
            </h3>
          </div>

          <p className="text-sm leading-relaxed text-on-surface-variant">
            {risk.explanation}
          </p>
        </div>
      )}

      {risk.limitations.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold text-primary">Limitations</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed text-on-surface-variant">
            {risk.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-on-surface-variant">
        {risk.disclaimer}
      </p>
    </section>
  );
}
