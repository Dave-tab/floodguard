
import { AlertCircle, Info, RefreshCw } from 'lucide-react';

interface LoadingCardProps {
  rows?: number;
}

interface ErrorBannerProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

interface UnavailableBlockProps {
  badgeText?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function LoadingCard({ rows = 3 }: LoadingCardProps) {
  return (
    <div
      className="animate-pulse rounded-xl border border-slate-200 bg-surface-container-lowest p-5"
      aria-label="Loading content"
      role="status"
    >
      <div className="mb-4 h-4 w-2/5 rounded bg-slate-200" />

      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="h-3 rounded bg-slate-100"
            style={{
              width: `${Math.max(45, 100 - index * 12)}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function ErrorBanner({
  title,
  message,
  onRetry,
}: ErrorBannerProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600"
          aria-hidden="true"
        />

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-bold text-red-900">{title}</h3>
          <p className="text-sm leading-relaxed text-red-800">{message}</p>
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-800 transition-colors hover:bg-red-100"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}

export function UnavailableBlock({
  badgeText = 'Data unavailable',
  title,
  message,
  actionLabel,
  onAction,
}: UnavailableBlockProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-surface-container-lowest p-5">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        {badgeText}
      </span>

      <div className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-primary">{title}</h3>
        <p className="text-sm leading-relaxed text-on-surface-variant">
          {message}
        </p>
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
