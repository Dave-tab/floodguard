import type { ReactNode } from 'react';

import type {
  AdminReportStatus,
  AlertSeverity,
  AssessmentRiskLevel,
} from '../../services/adminService';
import { ADMIN_STATUS_LABELS } from './adminUtils';

const STATUS_BADGE_STYLES = {
  dashboard: {
    base: 'rounded-full px-3 py-1.5 text-[11px] font-bold',
    colors: {
      pending: 'bg-amber-50 text-amber-800',
      verified: 'bg-brand-50 text-brand-800',
      rejected: 'bg-red-50 text-red-800',
      in_progress: 'bg-slate-100 text-slate-700',
      resolved: 'bg-slate-100 text-slate-700',
    },
  },
  report: {
    base: 'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
    colors: {
      pending: 'bg-amber-50 text-amber-800 ring-amber-600/20',
      verified: 'bg-brand-50 text-brand-800 ring-brand-100',
      rejected: 'bg-red-50 text-red-800 ring-red-600/20',
      in_progress: 'bg-slate-100 text-slate-700 ring-slate-300',
      resolved: 'bg-slate-100 text-slate-700 ring-slate-300',
    },
  },
} satisfies Record<
  'dashboard' | 'report',
  {
    base: string;
    colors: Record<AdminReportStatus, string>;
  }
>;

const RISK_LABELS: Record<AssessmentRiskLevel, string> = {
  low: 'Low',
  high: 'High',
  severe: 'Severe',
  critical: 'Critical',
};

const RISK_BADGE_STYLES = {
  dashboard: {
    base: 'rounded-full px-3 py-1.5 text-[11px] font-bold',
    colors: {
      low: 'bg-emerald-50 text-emerald-800',
      high: 'bg-orange-50 text-orange-800',
      severe: 'bg-red-50 text-red-700',
      critical: 'bg-red-100 text-red-900',
    },
    none: 'bg-slate-100 text-slate-700',
  },
  community: {
    base: 'inline-flex rounded-full border px-3 py-1.5 text-sm font-bold',
    colors: {
      low: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      high: 'border-orange-200 bg-orange-50 text-orange-800',
      severe: 'border-red-200 bg-red-50 text-red-700',
      critical: 'border-red-300 bg-red-100 text-red-900',
    },
    none: 'border-slate-200 bg-slate-50 text-slate-700',
  },
} satisfies Record<
  'dashboard' | 'community',
  {
    base: string;
    colors: Record<AssessmentRiskLevel, string>;
    none: string;
  }
>;

const SEVERITY_BADGE_STYLES: Record<AlertSeverity, string> = {
  info: 'border-sky-300 bg-sky-50 text-sky-900',
  low: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  moderate: 'border-amber-300 bg-amber-50 text-amber-900',
  high: 'border-orange-300 bg-orange-50 text-orange-900',
  critical: 'border-red-300 bg-red-50 text-red-900',
};

interface AdminSectionHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
  eyebrowClassName: string;
  titleClassName: string;
  descriptionClassName?: string;
  headingLevel?: 'h1' | 'h2';
  children?: ReactNode;
}

interface AdminAlertProps {
  children: ReactNode;
  className: string;
  as?: 'div' | 'p';
}

interface AdminOutputProps {
  children: ReactNode;
  className: string;
}

export function AdminSectionHeader({
  eyebrow,
  title,
  description,
  className,
  eyebrowClassName,
  titleClassName,
  descriptionClassName,
  headingLevel = 'h2',
  children,
}: Readonly<AdminSectionHeaderProps>) {
  const Heading = headingLevel;

  return (
    <header className={className}>
      <div>
        <p className={eyebrowClassName}>{eyebrow}</p>
        <Heading className={titleClassName}>{title}</Heading>
        {description !== undefined && descriptionClassName && (
          <p className={descriptionClassName}>{description}</p>
        )}
      </div>
      {children}
    </header>
  );
}

export function AdminStatusBadge({
  status,
  variant = 'report',
}: Readonly<{
  status: AdminReportStatus;
  variant?: 'dashboard' | 'report';
}>) {
  const styles = STATUS_BADGE_STYLES[variant];

  return (
    <span className={`${styles.base} ${styles.colors[status]}`}>
      {ADMIN_STATUS_LABELS[status]}
    </span>
  );
}

export function AdminRiskBadge({
  riskLevel,
  variant = 'dashboard',
  ariaLabel,
}: Readonly<{
  /** null when there is no current level (insufficient data or unavailable): never shown as Low. */
  riskLevel: AssessmentRiskLevel | null;
  variant?: 'dashboard' | 'community';
  ariaLabel?: string;
}>) {
  const styles = RISK_BADGE_STYLES[variant];
  const color = riskLevel ? styles.colors[riskLevel] : styles.none;

  return (
    <span aria-label={ariaLabel} className={`${styles.base} ${color}`}>
      {riskLevel ? RISK_LABELS[riskLevel] : 'No current level'}
    </span>
  );
}

export function AdminSeverityBadge({
  severity,
}: Readonly<{ severity: AlertSeverity }>) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${SEVERITY_BADGE_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

export function AdminAlert({
  children,
  className,
  as = 'div',
}: Readonly<AdminAlertProps>) {
  const Element = as;

  return (
    <Element className={className} role="alert">
      {children}
    </Element>
  );
}

export function AdminStatusOutput({
  children,
  className,
}: Readonly<AdminOutputProps>) {
  return <output className={`block ${className}`}>{children}</output>;
}

export function AdminLoadingState({
  children,
  className,
}: Readonly<AdminOutputProps>) {
  return <AdminStatusOutput className={className}>{children}</AdminStatusOutput>;
}

