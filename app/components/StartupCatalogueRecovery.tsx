import { useTranslation } from 'react-i18next';

/*
 * SSR supplies these labels before any client catalogue request.
 * React only renders this component again once those catalogues are loaded.
 */
export function StartupCatalogueRecovery() {
  const { t } = useTranslation();

  return (
    <section data-ecode-startup-recovery="" hidden role="alert" aria-labelledby="ecode-startup-recovery-title">
      <div>
        <h2 id="ecode-startup-recovery-title">{t('root.startupFailureTitle')}</h2>
        <p>{t('root.startupFailureDetail')}</p>
        <button type="button">{t('root.startupRetry')}</button>
      </div>
    </section>
  );
}
