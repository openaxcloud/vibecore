import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { classNames } from '~/utils/classNames';

interface HealthStatusBadgeProps {
  status: 'healthy' | 'unhealthy' | 'checking' | 'unknown';
  responseTime?: number;
  className?: string;
}

function HealthStatusBadge({ status, responseTime, className }: HealthStatusBadgeProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  const getStatusConfig = () => {
    switch (status) {
      case 'healthy':
        return {
          color: 'text-green-700 dark:text-green-300',
          bgColor: 'bg-green-500/10 border-green-500/20',
          Icon: CheckCircle,
          label: t('settings.copy.healthy_7f1e323b'),
        };
      case 'unhealthy':
        return {
          color: 'text-red-700 dark:text-red-300',
          bgColor: 'bg-red-500/10 border-red-500/20',
          Icon: XCircle,
          label: t('settings.copy.unhealthy_317b1fbc'),
        };
      case 'checking':
        return {
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10 border-blue-500/20',
          Icon: Loader2,
          label: t('settings.copy.checking_0dfe1d63'),
        };
      default:
        return {
          color: 'text-bolt-elements-textTertiary',
          bgColor: 'bg-bolt-elements-background-depth-3 border-bolt-elements-borderColor',
          Icon: AlertCircle,
          label: t('settings.copy.unknown_b764cdc0'),
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.Icon;

  return (
    <div
      className={classNames(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
        config.bgColor,
        config.color,
        className,
      )}
    >
      <Icon className={classNames('w-3 h-3', { 'animate-spin': status === 'checking' })} />
      <span>{config.label}</span>
      {responseTime !== undefined && status === 'healthy' && (
        <span className="opacity-75">
          ({new Intl.NumberFormat(language).format(responseTime)}
          {t('settings.copy.ms_9e7d85a5')}
        </span>
      )}
    </div>
  );
}

export default HealthStatusBadge;
