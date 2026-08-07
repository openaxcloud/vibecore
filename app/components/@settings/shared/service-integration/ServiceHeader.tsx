import { motion } from 'framer-motion';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import { getSettingsConnectorsResidualCopy } from '~/lib/i18n/catalogs/settings-connectors-residual';

interface ServiceHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  onTestConnection?: () => void;
  isTestingConnection?: boolean;
  additionalInfo?: React.ReactNode;
  delay?: number;
}

export const ServiceHeader = memo(
  ({
    icon: Icon, // eslint-disable-line @typescript-eslint/naming-convention
    title,
    description,
    onTestConnection,
    isTestingConnection,
    additionalInfo,
    delay = 0.1,
  }: ServiceHeaderProps) => {
    const { i18n } = useTranslation();
    const copy = getSettingsConnectorsResidualCopy(i18n.resolvedLanguage ?? i18n.language);

    return (
      <>
        <motion.div
          className="flex min-w-0 flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <h2 className="min-w-0 break-words text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
              {title}
            </h2>
          </div>
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {additionalInfo}
            {onTestConnection && (
              <Button
                onClick={onTestConnection}
                disabled={isTestingConnection}
                variant="outline"
                className="flex min-h-11 items-center gap-2 whitespace-normal transition-colors hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary"
              >
                {isTestingConnection ? (
                  <>
                    <span className="i-ph:spinner-gap h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                    <span role="status" aria-live="polite">
                      {copy['settingsResidual.serviceHeader.testing']}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="i-ph:plug-charging h-4 w-4 shrink-0" aria-hidden="true" />
                    {copy['settingsResidual.serviceHeader.test']}
                  </>
                )}
              </Button>
            )}
          </div>
        </motion.div>

        {description && (
          <p className="break-words text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
            {description}
          </p>
        )}
      </>
    );
  },
);
