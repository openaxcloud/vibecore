import { useTranslation } from 'react-i18next';

export function BinaryContent() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center absolute inset-0 z-10 text-sm bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary">
      {t('idePanels.editor.binaryUnavailable')}
    </div>
  );
}
