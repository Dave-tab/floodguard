import type { ReactNode } from 'react';

import type {
  AdminReportStatus,
  AssessmentRiskLevel,
} from '../../services/supabaseClient';
import { ADMIN_STATUS_LABELS } from './adminUtils';

const STATUS_BADGE_STYLES = {
  dashboard: {
    base: 'rounded-full px-3 py-1.5 text-[11px] font-bold',
    colors: {
      pending: 'bg-amber-50 text-amber-800',
      verified: 'bg-brand-50 text-brand-800',
      rejected: 'bg-red-50 text-red-800',
      in_progress: 'bg-amber-50 text-amber-800',
      resolved: 'bg-emerald-50 text-emerald-800',
    },
  },
  report: {
    base: 'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
    colors: {
      pending: 'bg-amber-50 text-amber-800 ring-amber-600/20',
      verified: 'bg-brand-50 text-brand-800 ring-brand-100',
      rejected: 'bg-red-50 text-red-800 ring-red-600/20',
      in_progress: 'bg-amber-50 text-amber-800 ring-amber-600/20',
      resolved: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
    },
  },
} satisfies Record<
  'dashboard' | 'report',
  {
    base: string;
    colors: Record<AdminReportStatus, string>;
  }
>;

const RISK_BADGE_STYLES = {
  dashboard: {
    base: 'rounded-full px-3 py-1.5 text-[11px] font-bold',
    colors: {
      LOW: 'bg-emerald-50 text-emerald-800',
      MODERATE: 'bg-amber-50 text-amber-800',
      HIGH: 'bg-orange-50 text-orange-800',
      CRITICAL: 'bg-red-50 text-red-800',
    },
  },
  community: {
    base: 'inline-flex rounded-full border px-3 py-1.5 text-sm font-bold',
    colors: {
      LOW: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      MODERATE: 'border-amber-200 bg-amber-50 text-amber-800',
      HIGH: 'border-orange-200 bg-orange-50 text-orange-800',
      CRITICAL: 'border-red-200 bg-red-50 text-red-800',
    },
  },
} satisfies Record<
  'dashboard' | 'community',
  {
    base: string;
    colors: Record<AssessmentRiskLevel, string>;
  }
>;

const SEVERITY_BADGE_STYLES: Record<AssessmentRiskLevel, string> = {
  LOW: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  MODERATE: 'border-amber-300 bg-amber-50 text-amber-900',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-900',
  CRITICAL: 'border-red-300 bg-red-50 text-red-900',
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
  riskLevel: AssessmentRiskLevel;
  variant?: 'dashboard' | 'community';
  ariaLabel?: string;
}>) {
  const styles = RISK_BADGE_STYLES[variant];

  return (
    <span
      aria-label={ariaLabel}
      className={`${styles.base} ${styles.colors[riskLevel]}`}
    >
      {riskLevel}
    </span>
  );
}

export function AdminSeverityBadge({
  severity,
}: Readonly<{ severity: AssessmentRiskLevel }>) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${SEVERITY_BADGE_STYLES[severity]}`}
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

