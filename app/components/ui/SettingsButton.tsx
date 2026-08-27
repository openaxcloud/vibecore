import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '~/components/ui/IconButton';
interface SettingsButtonProps {
  onClick: () => void;
}

export const SettingsButton = memo(({ onClick }: SettingsButtonProps) => {
  const { t } = useTranslation();

  return (
    <IconButton
      onClick={onClick}
      icon="i-ph:gear"
      size="xl"
      title={t('sidebarMenu.header.settings')}
      data-testid="settings-button"
      className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive/10 transition-colors"
    />
  );
});

interface HelpButtonProps {
  onClick: () => void;
}

export const HelpButton = memo(({ onClick }: HelpButtonProps) => {
  const { t } = useTranslation();

  return (
    <IconButton
      onClick={onClick}
      icon="i-ph:question"
      size="xl"
      title={t('sidebarMenu.header.help')}
      data-testid="help-button"
      className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive/10 transition-colors"
    />
  );
});
