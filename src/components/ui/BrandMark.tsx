
import { Droplets } from 'lucide-react';

interface BrandMarkProps {
  compact?: boolean;
  light?: boolean;
}

export function BrandMark({
  compact = false,
  light = false,
}: BrandMarkProps) {
  const textColor = light ? 'text-white' : 'text-primary';
  const subtitleColor = light
    ? 'text-white/70'
    : 'text-on-surface-variant';

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-secondary text-white shadow-sm">
        <Droplets className="h-6 w-6" aria-hidden="true" />
      </div>

      {!compact && (
        <div className="flex min-w-0 flex-col">
          <span className={`text-base font-extrabold tracking-tight ${textColor}`}>
            FloodGuard<span className="text-secondary"> AI</span>
          </span>
          <span className={`text-[10px] font-medium ${subtitleColor}`}>
            Know the Risk. Prepare Before It Happens.
          </span>
        </div>
      )}
    </div>
  );
}
