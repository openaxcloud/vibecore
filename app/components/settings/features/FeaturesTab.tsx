import React from 'react';
import { motion } from 'framer-motion';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { useStore } from '@nanostores/react';
import { isEventLogsEnabled } from '~/lib/stores/settings';

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

export default function FeaturesTab() {
  const {
    setEventLogs,
    isLocalModel,
    enableLocalModels,
    isLatestBranch,
    enableLatestBranch,
    promptId,
    setPromptId,
    autoSelectTemplate,
    setAutoSelectTemplate,
    enableContextOptimization,
    contextOptimizationEnabled,
  } = useSettings();

  const eventLogs = useStore(isEventLogsEnabled);

  const features: FeatureToggle[] = [
    {
      id: 'latestBranch',
      title: 'Use Main Branch',
      description: 'Check for updates against the main branch instead of stable',
      icon: 'i-ph:git-branch',
      enabled: isLatestBranch,
      beta: true,
      tooltip: 'Get the latest features and improvements before they are officially released',
    },
    {
      id: 'autoTemplate',
      title: 'Auto Select Code Template',
      description: 'Let Bolt select the best starter template for your project',
      icon: 'i-ph:magic-wand',
      enabled: autoSelectTemplate,
      tooltip: 'Automatically choose the most suitable template based on your project type',
    },
    {
      id: 'contextOptimization',
      title: 'Context Optimization',
      description: 'Optimize chat context by redacting file contents and using system prompts',
      icon: 'i-ph:arrows-in',
      enabled: contextOptimizationEnabled,
      tooltip: 'Improve AI responses by optimizing the context window and system prompts',
    },
    {
      id: 'experimentalProviders',
      title: 'Experimental Providers',
      description: 'Enable experimental providers like Ollama, LMStudio, and OpenAILike',
      icon: 'i-ph:robot',
      enabled: isLocalModel,
      experimental: true,
      tooltip: 'Try out new AI providers and models in development',
    },
    {
      id: 'eventLogs',
      title: 'Event Logging',
      description: 'Enable detailed event logging and history',
      icon: 'i-ph:list-bullets',
      enabled: eventLogs,
      tooltip: 'Record detailed logs of system events and user actions',
    },
  ];

  const handleToggleFeature = (featureId: string, enabled: boolean) => {
    switch (featureId) {
      case 'latestBranch':
        enableLatestBranch(enabled);
        toast.success(`Main branch updates ${enabled ? 'enabled' : 'disabled'}`);
        break;
      case 'autoTemplate':
        setAutoSelectTemplate(enabled);
        toast.success(`Auto template selection ${enabled ? 'enabled' : 'disabled'}`);
        break;
      case 'contextOptimization':
        enableContextOptimization(enabled);
        toast.success(`Context optimization ${enabled ? 'enabled' : 'disabled'}`);
        break;
      case 'experimentalProviders':
        enableLocalModels(enabled);
        toast.success(`Experimental providers ${enabled ? 'enabled' : 'disabled'}`);
        break;
      case 'eventLogs':
        setEventLogs(enabled);
        toast.success(`Event logging ${enabled ? 'enabled' : 'disabled'}`);
        break;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        className="flex items-center gap-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="i-ph:puzzle-piece text-xl text-purple-500" />
        <div>
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Features</h3>
          <p className="text-sm text-bolt-elements-textSecondary">
            Customize your Bolt experience with experimental features
          </p>
        </div>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {features.map((feature, index) => (
          <motion.div
            key={feature.id}
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
            <div className="absolute top-0 right-0 p-2 flex gap-1">
              {feature.beta && (
                <motion.span
                  className="px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-500 font-medium"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Beta
                </motion.span>
              )}
              {feature.experimental && (
                <motion.span
                  className="px-2 py-0.5 text-xs rounded-full bg-purple-500/10 text-purple-500 font-medium"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Experimental
                </motion.span>
              )}
            </div>

            <div className="flex items-start gap-4 p-4">
              <motion.div
                className={classNames(
                  'p-2 rounded-lg text-xl',
                  'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
                  'transition-colors duration-200',
                )}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <div className={classNames(feature.icon, 'text-purple-500')} />
              </motion.div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-purple-500 transition-colors">
                      {feature.title}
                    </h4>
                    <p className="text-xs text-bolt-elements-textSecondary mt-0.5">{feature.description}</p>
                  </div>
                  <Switch
                    checked={feature.enabled}
                    onCheckedChange={(checked) => handleToggleFeature(feature.id, checked)}
                  />
                </div>
              </div>
            </div>

            <motion.div
              className="absolute inset-0 border-2 border-purple-500/0 rounded-lg pointer-events-none"
              animate={{
                borderColor: feature.enabled ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0)',
                scale: feature.enabled ? 1 : 0.98,
              }}
              transition={{ duration: 0.2 }}
            />
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        className={classNames(
          'bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'transition-all duration-200',
          'rounded-lg',
          'group',
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        whileHover={{ scale: 1.01 }}
      >
        <div className="flex items-start gap-4 p-4">
          <motion.div
            className={classNames(
              'p-2 rounded-lg text-xl',
              'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
              'transition-colors duration-200',
            )}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <div className="i-ph:book text-purple-500" />
          </motion.div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-purple-500 transition-colors">
                  Prompt Library
                </h4>
                <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                  Choose a prompt from the library to use as the system prompt
                </p>
              </div>
              <select
                value={promptId}
                onChange={(e) => {
                  setPromptId(e.target.value);
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
          </div>
        </div>
      </motion.div>
    </div>
  );
}
