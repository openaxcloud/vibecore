import type { ReactNode } from 'react';
import { classNames } from '~/utils/classNames';

export type AlertVariant = 'error' | 'success' | 'warning' | 'info';

/*
 * Canonical inline status banner (I2). One tokenised look for the ~25 hand-rolled
 * `border-red-500/40 bg-red-500/10 text-red-500`-style banners across routes.
 * Colours come from the --status-* tokens; error/warning announce as role="alert",
 * success/info as role="status".
 */
const VARIANTS: Record<AlertVariant, { token: string; icon: string; role: 'alert' | 'status' }> = {
  error: { token: 'error', icon: 'i-ph:warning-circle', role: 'alert' },
  warning: { token: 'warning', icon: 'i-ph:warning', role: 'alert' },
  success: { token: 'success', icon: 'i-ph:check-circle', role: 'status' },
  info: { token: 'info', icon: 'i-ph:info', role: 'status' },
};

interface AlertBannerProps {
  variant?: AlertVariant;
  children: ReactNode;

  /** Override the default variant icon (a UnoCSS icon class), or null to hide it. */
  icon?: string | null;
  className?: string;
}

export function AlertBanner({ variant = 'info', children, icon, className }: AlertBannerProps) {
  const config = VARIANTS[variant];
  const iconClass = icon === null ? null : (icon ?? config.icon);

  return (
    <div
      role={config.role}
      className={classNames('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', className)}
      style={{
        borderColor: `color-mix(in srgb, var(--status-${config.token}-text) 40%, transparent)`,
        background: `var(--status-${config.token}-bg)`,
        color: `var(--status-${config.token}-text)`,
      }}
    >
      {iconClass ? <span className={classNames(iconClass, 'mt-0.5 shrink-0 text-base')} aria-hidden /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
