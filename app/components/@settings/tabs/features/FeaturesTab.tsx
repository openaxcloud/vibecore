// Remove unused imports
import { motion } from 'framer-motion';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Switch } from '~/components/ui/Switch';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { useSettings } from '~/lib/hooks/useSettings';
import { classNames } from '~/utils/classNames';

interface FeatureToggle {
  id: string;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
  beta?: boolean;
  experimental?: boolean;
  tooltip?: string;
}

const FeatureCard = memo(
  ({
    feature,
    index,
    onToggle,
  }: {
    feature: FeatureToggle;
    index: number;
    onToggle: (id: string, enabled: boolean) => void;
  }) => {
    const { t } = useTranslation();

    return (
      <motion.div
        key={feature.id}
        layoutId={feature.id}
        className={classNames(
          'relative group cursor-pointer',
          'bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'transition-colors duration-200',
          'rounded-lg overflow-hidden',
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
      >
        <div className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className={classNames(feature.icon, 'h-5 w-5 shrink-0 text-bolt-elements-textSecondary')} />
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h4 className="break-words font-medium text-bolt-elements-textPrimary">{feature.title}</h4>
                {feature.beta && (
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
                    {t('featuresSettings.badge.beta')}
                  </span>
                )}
                {feature.experimental && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/10 text-orange-500 font-medium">
                    {t('featuresSettings.badge.experimental')}
                  </span>
                )}
              </div>
            </div>
            <Switch
              checked={feature.enabled}
              aria-label={t('featuresSettings.toggleAria', { feature: feature.title })}
              onCheckedChange={(checked) => onToggle(feature.id, checked)}
            />
          </div>
          <p className="mt-2 break-words text-sm text-bolt-elements-textSecondary">{feature.description}</p>
          {feature.tooltip && (
            <p className="mt-1 break-words text-xs text-bolt-elements-textTertiary">{feature.tooltip}</p>
          )}
        </div>
      </motion.div>
    );
  },
);

const FeatureSection = memo(
  ({
    title,
    features,
    icon,
    description,
    onToggleFeature,
  }: {
    title: string;
    features: FeatureToggle[];
    icon: string;
    description: string;
    onToggleFeature: (id: string, enabled: boolean) => void;
  }) => (
    <motion.div
      layout
      className="flex flex-col gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-3">
        <div className={classNames(icon, 'text-xl text-[var(--vc-ide-accent-action)]')} />
        <div>
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary">{title}</h3>
          <p className="text-sm text-bolt-elements-textSecondary">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature, index) => (
          <FeatureCard key={feature.id} feature={feature} index={index} onToggle={onToggleFeature} />
        ))}
      </div>
    </motion.div>
  ),
);

export default function FeaturesTab() {
  const { t } = useTranslation();

  const {
    autoSelectTemplate,
    isLatestBranch,
    contextOptimizationEnabled,
    eventLogs,
    setAutoSelectTemplate,
    enableLatestBranch,
    enableContextOptimization,
    setEventLogs,
    setPromptId,
    promptId,
  } = useSettings();

  // Enable features by default on first load
  React.useEffect(() => {
    // Only set defaults if values are undefined
    if (isLatestBranch === undefined) {
      enableLatestBranch(false); // Default: OFF - Don't auto-update from main branch
    }

    if (contextOptimizationEnabled === undefined) {
      enableContextOptimization(true); // Default: ON - Enable context optimization
    }

    if (autoSelectTemplate === undefined) {
      setAutoSelectTemplate(true); // Default: ON - Enable auto-select templates
    }

    if (promptId === undefined) {
      setPromptId('default'); // Default: 'default'
    }

    if (eventLogs === undefined) {
      setEventLogs(true); // Default: ON - Enable event logging
    }
  }, []); // Only run once on component mount

  const handleToggleFeature = useCallback(
    (id: string, enabled: boolean) => {
      switch (id) {
        case 'latestBranch': {
          enableLatestBranch(enabled);
          toast.success(
            t('featuresSettings.toast.state', {
              feature: t('featuresSettings.latestBranch.title'),
              state: t(enabled ? 'featuresSettings.state.enabled' : 'featuresSettings.state.disabled'),
            }),
          );
          break;
        }

        case 'autoSelectTemplate': {
          setAutoSelectTemplate(enabled);
          toast.success(
            t('featuresSettings.toast.state', {
              feature: t('featuresSettings.autoTemplate.title'),
              state: t(enabled ? 'featuresSettings.state.enabled' : 'featuresSettings.state.disabled'),
            }),
          );
          break;
        }

        case 'contextOptimization': {
          enableContextOptimization(enabled);
          toast.success(
            t('featuresSettings.toast.state', {
              feature: t('featuresSettings.context.title'),
              state: t(enabled ? 'featuresSettings.state.enabled' : 'featuresSettings.state.disabled'),
            }),
          );
          break;
        }

        case 'eventLogs': {
          setEventLogs(enabled);
          toast.success(
            t('featuresSettings.toast.state', {
              feature: t('featuresSettings.eventLogs.title'),
              state: t(enabled ? 'featuresSettings.state.enabled' : 'featuresSettings.state.disabled'),
            }),
          );
          break;
        }

        default:
          break;
      }
    },
    [enableLatestBranch, setAutoSelectTemplate, enableContextOptimization, setEventLogs, t],
  );

  const features = {
    stable: [
      {
        id: 'latestBranch',
        title: t('featuresSettings.latestBranch.title'),
        description: t('featuresSettings.latestBranch.description'),
        icon: 'i-ph:git-branch',
        enabled: isLatestBranch,
        tooltip: t('featuresSettings.latestBranch.tooltip'),
      },
      {
        id: 'autoSelectTemplate',
        title: t('featuresSettings.autoTemplate.title'),
        description: t('featuresSettings.autoTemplate.description'),
        icon: 'i-ph:selection',
        enabled: autoSelectTemplate,
        tooltip: t('featuresSettings.autoTemplate.tooltip'),
      },
      {
        id: 'contextOptimization',
        title: t('featuresSettings.context.title'),
        description: t('featuresSettings.context.description'),
        icon: 'i-ph:brain',
        enabled: contextOptimizationEnabled,
        tooltip: t('featuresSettings.context.tooltip'),
      },
      {
        id: 'eventLogs',
        title: t('featuresSettings.eventLogs.title'),
        description: t('featuresSettings.eventLogs.description'),
        icon: 'i-ph:list-bullets',
        enabled: eventLogs,
        tooltip: t('featuresSettings.eventLogs.tooltip'),
      },
    ],
    beta: [],
  };

  return (
    <div className="flex flex-col gap-8">
      <FeatureSection
        title={t('featuresSettings.core.title')}
        features={features.stable}
        icon="i-ph:check-circle"
        description={t('featuresSettings.core.description')}
        onToggleFeature={handleToggleFeature}
      />

      {features.beta.length > 0 && (
        <FeatureSection
          title={t('featuresSettings.beta.title')}
          features={features.beta}
          icon="i-ph:test-tube"
          description={t('featuresSettings.beta.description')}
          onToggleFeature={handleToggleFeature}
        />
      )}

      <motion.div
        layout
        className={classNames(
          'bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'transition-all duration-200',
          'rounded-lg p-4',
          'group',
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <div
            className={classNames(
              'p-2 rounded-lg text-xl',
              'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
              'transition-colors duration-200',
              'text-[var(--vc-ide-accent-action)]',
            )}
          >
            <div className="i-ph:book" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="break-words text-sm font-medium text-bolt-elements-textPrimary transition-colors group-hover:text-[var(--vc-ide-accent-action)]">
              {t('featuresSettings.prompt.title')}
            </h4>
            <p className="mt-0.5 break-words text-xs text-bolt-elements-textSecondary">
              {t('featuresSettings.prompt.description')}
            </p>
          </div>
          <select
            aria-label={t('featuresSettings.prompt.aria')}
            value={promptId}
            onChange={(e) => {
              setPromptId(e.target.value);
              toast.success(t('featuresSettings.prompt.updated'));
            }}
            className={classNames(
              'w-full min-w-0 max-w-full rounded-lg p-2 text-sm sm:w-auto sm:min-w-[min(200px,100%)]',
              'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-[var(--vc-ide-focus-ring)]',
              'group-hover:border-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)]',
              'transition-all duration-200',
            )}
          >
            {PromptLibrary.getList().map((x) => (
              <option key={x.id} value={x.id}>
                {t(`featuresSettings.prompt.${x.id}`)}
              </option>
            ))}
          </select>
        </div>
      </motion.div>
    </div>
  );
}
