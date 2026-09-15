import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '~/components/ui/IconButton';
import { getSidebarMenuCopy } from '~/lib/i18n/catalogs/sidebar-menu';
interface SettingsButtonProps {
  onClick: () => void;
}

export const SettingsButton = memo(({ onClick }: SettingsButtonProps) => {
  /*
   * I18N-HALF-MIGRATION-001 — ces libellés vivent dans un catalogue OBJET, lu par
   * `getSidebarMenuCopy()`, et non dans le registre plat que `t()` interroge.
   *
   * `t('sidebarMenu.header.settings')` ne résolvait donc rien : i18next rend la
   * CLÉ quand elle est absente, et l'infobulle du bouton affichait
   * « sidebarMenu.header.settings » à l'utilisateur.
   *
   * `Menu.client.tsx` consomme déjà ce catalogue par l'accesseur ; c'est ici que
   * la migration s'est arrêtée à mi-chemin.
   */
  const { i18n } = useTranslation();
  const copy = getSidebarMenuCopy(i18n.resolvedLanguage ?? i18n.language).sidebarMenu.header;

  return (
    <IconButton
      onClick={onClick}
      icon="i-ph:gear"
      size="xl"
      title={copy.settings}
      data-testid="settings-button"
      className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive/10 transition-colors"
    />
  );
});

interface HelpButtonProps {
  onClick: () => void;
}

export const HelpButton = memo(({ onClick }: HelpButtonProps) => {
  // Même défaut que SettingsButton : catalogue objet, pas registre plat.
  const { i18n } = useTranslation();
  const copy = getSidebarMenuCopy(i18n.resolvedLanguage ?? i18n.language).sidebarMenu.header;

  return (
    <IconButton
      onClick={onClick}
      icon="i-ph:question"
      size="xl"
      title={copy.help}
      data-testid="help-button"
      className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive/10 transition-colors"
    />
  );
});
