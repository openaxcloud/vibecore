import { useTranslation } from 'react-i18next';
import { getDatabaseStudioCopy } from '~/lib/i18n/catalogs/database-studio';

/** Structural context stays visible before any database data is available. */
export function DatabaseHeading() {
  const { i18n } = useTranslation();
  const copy = getDatabaseStudioCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <h2 className="min-w-0 break-words text-[15px] font-semibold text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
      {copy['databaseWorkbench.allDatabases']}
    </h2>
  );
}
