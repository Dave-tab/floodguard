
import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

import type {
  EmergencyHotline,
  SafetyGuidelineItem,
} from '../../types/resident';

interface SafetyGuidelinesCardProps {
  lgaLabel: string;
  guidelines: SafetyGuidelineItem[];
  hotlines: EmergencyHotline[];
}

export function SafetyGuidelinesCard({
  lgaLabel,
  guidelines,
  hotlines,
}: SafetyGuidelinesCardProps) {
  const sections = [
    { key: 'before', label: 'Before flooding' },
    { key: 'during', label: 'During flooding' },
    { key: 'after', label: 'After flooding' },
    { key: 'general', label: 'General guidance' },
  ] as const;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-secondary" />
        <div>
          <h2 className="font-bold text-primary">Flood Safety Guidance</h2>
          <p className="text-xs text-on-surface-variant">
            General guidance for residents in {lgaLabel}.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {sections.map((section) => {
          const items = guidelines.filter(
            (item) => item.category === section.key,
          );

          if (!items.length) return null;

          return (
            <div key={section.key}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
                {section.label}
              </h3>

              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-secondary" />
                    <div>
                      <h4 className="text-xs font-bold text-primary">
                        {item.title}
                      </h4>
                      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
          <p className="text-xs leading-relaxed text-amber-900">
            Never walk or drive through floodwater. Follow instructions
            from your local emergency management authorities.
          </p>
        </div>
      </div>

      {hotlines.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold text-primary">
            Emergency contacts
          </h3>

          <div className="flex flex-col gap-2">
            {hotlines.map((hotline) => (
              <div
                key={hotline.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"
              >
                <div>
                  <p className="text-xs font-bold text-primary">
                    {hotline.name}
                  </p>
                  {hotline.description && (
                    <p className="mt-1 text-[11px] text-on-surface-variant">
                      {hotline.description}
                    </p>
                  )}
                </div>

                <a
                  href={hotline.telHref}
                  className="text-xs font-bold text-secondary hover:underline"
                >
                  {hotline.phone}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
