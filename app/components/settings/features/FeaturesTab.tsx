import React, { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { PromptLibrary } from '~/lib/common/prompt-library';
import {
  latestBranchStore,
  autoSelectStarterTemplate,
  enableContextOptimizationStore,
  isLocalModelsEnabled,
  isEventLogsEnabled,
  promptStore as promptAtom,
} from '~/lib/stores/settings';
import { logStore } from '~/lib/stores/logs';

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
  }) => (
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={classNames(feature.icon, 'w-5 h-5 text-bolt-elements-textSecondary')} />
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-bolt-elements-textPrimary">{feature.title}</h4>
              {feature.beta && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-500 font-medium">Beta</span>
              )}
              {feature.experimental && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/10 text-orange-500 font-medium">
                  Experimental
                </span>
              )}
            </div>
          </div>
          <Switch checked={feature.enabled} onCheckedChange={(checked) => onToggle(feature.id, checked)} />
        </div>
        <p className="mt-2 text-sm text-bolt-elements-textSecondary">{feature.description}</p>
        {feature.tooltip && <p className="mt-1 text-xs text-bolt-elements-textTertiary">{feature.tooltip}</p>}
      </div>
    </motion.div>
  ),
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
        <div className={classNames(icon, 'text-xl text-purple-500')} />
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
  const { autoSelectTemplate, isLatestBranch, contextOptimizationEnabled, eventLogs, isLocalModel } = useSettings();

  const getLocalStorageBoolean = (key: string, defaultValue: boolean): boolean => {
    const value = localStorage.getItem(key);

    if (value === null) {
      return defaultValue;
    }

    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  };

  const autoSelectTemplateState = getLocalStorageBoolean('autoSelectTemplate', autoSelectTemplate);
  const enableLatestBranchState = getLocalStorageBoolean('enableLatestBranch', isLatestBranch);
  const contextOptimizationState = getLocalStorageBoolean('contextOptimization', contextOptimizationEnabled);
  const eventLogsState = getLocalStorageBoolean('eventLogs', eventLogs);
  const experimentalProvidersState = getLocalStorageBoolean('experimentalProviders', isLocalModel);
  const promptLibraryState = getLocalStorageBoolean('promptLibrary', false);
  const promptIdState = localStorage.getItem('promptId') ?? '';

  const [autoSelectTemplateLocal, setAutoSelectTemplateLocal] = useState(autoSelectTemplateState);
  const [enableLatestBranchLocal, setEnableLatestBranchLocal] = useState(enableLatestBranchState);
  const [contextOptimizationLocal, setContextOptimizationLocal] = useState(contextOptimizationState);
  const [eventLogsLocal, setEventLogsLocal] = useState(eventLogsState);
  const [experimentalProvidersLocal, setExperimentalProvidersLocal] = useState(experimentalProvidersState);
  const [promptLibraryLocal, setPromptLibraryLocal] = useState(promptLibraryState);
  const [promptIdLocal, setPromptIdLocal] = useState(promptIdState);

  useEffect(() => {
    localStorage.setItem('autoSelectTemplate', JSON.stringify(autoSelectTemplateLocal));
    localStorage.setItem('enableLatestBranch', JSON.stringify(enableLatestBranchLocal));
    localStorage.setItem('contextOptimization', JSON.stringify(contextOptimizationLocal));
    localStorage.setItem('eventLogs', JSON.stringify(eventLogsLocal));
    localStorage.setItem('experimentalProviders', JSON.stringify(experimentalProvidersLocal));
    localStorage.setItem('promptLibrary', JSON.stringify(promptLibraryLocal));
    localStorage.setItem('promptId', promptIdLocal);

    autoSelectStarterTemplate.set(autoSelectTemplateLocal);
    latestBranchStore.set(enableLatestBranchLocal);
    enableContextOptimizationStore.set(contextOptimizationLocal);
    isEventLogsEnabled.set(eventLogsLocal);
    isLocalModelsEnabled.set(experimentalProvidersLocal);
    promptAtom.set(promptIdLocal);
  }, [
    autoSelectTemplateLocal,
    enableLatestBranchLocal,
    contextOptimizationLocal,
    eventLogsLocal,
    experimentalProvidersLocal,
    promptLibraryLocal,
    promptIdLocal,
  ]);

  const handleToggleFeature = (featureId: string, enabled: boolean) => {
    logStore.logFeatureToggle(featureId, enabled);

    switch (featureId) {
      case 'latestBranch':
        setEnableLatestBranchLocal(enabled);
        latestBranchStore.set(enabled);
        toast.success(`Main branch updates ${enabled ? 'enabled' : 'disabled'}`);
        break;
      case 'autoSelectTemplate':
        setAutoSelectTemplateLocal(enabled);
        autoSelectStarterTemplate.set(enabled);
        toast.success(`Auto template selection ${enabled ? 'enabled' : 'disabled'}`);
        break;
      case 'contextOptimization':
        setContextOptimizationLocal(enabled);
        enableContextOptimizationStore.set(enabled);
        toast.success(`Context optimization ${enabled ? 'enabled' : 'disabled'}`);
        break;
      case 'localModels':
        setExperimentalProvidersLocal(enabled);
        isLocalModelsEnabled.set(enabled);
        toast.success(`Experimental providers ${enabled ? 'enabled' : 'disabled'}`);
        break;
      case 'eventLogs':
        setEventLogsLocal(enabled);
        isEventLogsEnabled.set(enabled);
        toast.success(`Event logging ${enabled ? 'enabled' : 'disabled'}`);
        break;
      case 'promptLibrary':
        setPromptLibraryLocal(enabled);
        toast.success(`Prompt Library ${enabled ? 'enabled' : 'disabled'}`);
        break;
    }
  };

  const features: Record<'stable' | 'beta' | 'experimental', FeatureToggle[]> = {
    stable: [
      {
        id: 'autoSelectTemplate',
        title: 'Auto Select Code Template',
        description: 'Let Bolt select the best starter template for your project',
        icon: 'i-ph:magic-wand',
        enabled: autoSelectTemplateLocal,
        tooltip: 'Automatically choose the most suitable template based on your project type',
      },
      {
        id: 'contextOptimization',
        title: 'Context Optimization',
        description: 'Optimize chat context by redacting file contents and using system prompts',
        icon: 'i-ph:arrows-in',
        enabled: contextOptimizationLocal,
        tooltip: 'Improve AI responses by optimizing the context window and system prompts',
      },
      {
        id: 'eventLogs',
        title: 'Event Logging',
        description: 'Enable detailed event logging and history',
        icon: 'i-ph:list-bullets',
        enabled: eventLogsLocal,
        tooltip: 'Record detailed logs of system events and user actions',
      },
      {
        id: 'promptLibrary',
        title: 'Prompt Library',
        description: 'Manage your prompt library settings',
        icon: 'i-ph:library',
        enabled: promptLibraryLocal,
        tooltip: 'Enable or disable the prompt library',
      },
    ],
    beta: [],
    experimental: [
      {
        id: 'localModels',
        title: 'Experimental Providers',
        description: 'Enable experimental providers like Ollama, LMStudio, and OpenAILike',
        icon: 'i-ph:robot',
        enabled: experimentalProvidersLocal,
        experimental: true,
        tooltip: 'Try out new AI providers and models in development',
      },
    ],
  };

  return (
    <div className="flex flex-col gap-8">
      <FeatureSection
        title="Stable Features"
        features={features.stable}
        icon="i-ph:check-circle"
        description="Production-ready features that have been thoroughly tested"
        onToggleFeature={handleToggleFeature}
      />

      {features.beta.length > 0 && (
        <FeatureSection
          title="Beta Features"
          features={features.beta}
          icon="i-ph:test-tube"
          description="New features that are ready for testing but may have some rough edges"
          onToggleFeature={handleToggleFeature}
        />
      )}

      {features.experimental.length > 0 && (
        <FeatureSection
          title="Experimental Features"
          features={features.experimental}
          icon="i-ph:flask"
          description="Features in early development that may be unstable or require additional setup"
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
        <div className="flex items-center gap-4">
          <div
            className={classNames(
              'p-2 rounded-lg text-xl',
              'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
              'transition-colors duration-200',
              'text-purple-500',
            )}
          >
            <div className="i-ph:book" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-purple-500 transition-colors">
              Prompt Library
            </h4>
            <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
              Choose a prompt from the library to use as the system prompt
            </p>
          </div>
          <select
            value={promptIdLocal}
            onChange={(e) => {
              setPromptIdLocal(e.target.value);
              toast.success('Prompt template updated');
            }}
            className={classNames(
              'p-2 rounded-lg text-sm min-w-[200px]',
              'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'group-hover:border-purple-500/30',
              'transition-all duration-200',
            )}
          >
            {PromptLibrary.getList().map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
      </motion.div>
    </div>
  );
}
