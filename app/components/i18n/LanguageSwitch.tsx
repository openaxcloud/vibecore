import { useTranslation } from 'react-i18next';

import { normalizeSupportedLanguage, setUserLanguagePreference, type SupportedLanguage } from '~/lib/i18n/language';

const DISPLAY_LANGUAGES = ['en', 'fr'] as const satisfies readonly SupportedLanguage[];

export function buildLanguageSwitchUrl(currentUrl: string, language: SupportedLanguage): string {
  const target = new URL(currentUrl);

  /*
   * Replace an existing locale query instead of reloading it unchanged. Query
   * selection intentionally outranks the cookie in request-locale.ts, so a
   * plain reload of `?lang=fr` after clicking EN would otherwise stay French.
   * Keeping the explicit target also makes the switch work when cookies are
   * unavailable; canonical metadata still points at the query-free EN URL.
   */
  target.searchParams.set('lang', language);

  return target.toString();
}

export function LanguageSwitch({
  className = '',
  onLanguageChange,
}: {
  className?: string;
  onLanguageChange?: (language: SupportedLanguage) => void;
}) {
  const { i18n, t } = useTranslation();
  const activeLanguage = normalizeSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  const selectLanguage = (language: SupportedLanguage) => {
    if (language === activeLanguage) {
      return;
    }

    setUserLanguagePreference(language);

    const persistForAuthenticatedUser = fetch('/api/user/preferences', {
      method: 'PATCH',
      credentials: 'same-origin',
      keepalive: true,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ language }),
    }).catch(() => undefined);

    /*
     * Reload so SSR metadata, Content-Language, <html lang>, server-rendered
     * marketing copy and the client catalog all change atomically. A client-
     * only i18next flip would leave SEO and loader-generated messages stale.
     * The best-effort authenticated preference update also gives background
     * jobs and future transactional messages the same locale; anonymous and
     * offline visitors still retain the authoritative language cookie.
     */
    if (onLanguageChange) {
      onLanguageChange(language);

      void persistForAuthenticatedUser;

      return;
    }

    let reloaded = false;

    const reload = () => {
      if (reloaded) {
        return;
      }

      reloaded = true;
      window.location.replace(buildLanguageSwitchUrl(window.location.href, language));
    };

    window.setTimeout(reload, 600);
    void persistForAuthenticatedUser.finally(reload);
  };

  return (
    <div
      className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-xs font-semibold shadow-sm ${className}`}
      role="group"
      aria-label={t('locale.switchLabel')}
      data-testid="language-switch"
    >
      {DISPLAY_LANGUAGES.map((language) => {
        const active = language === activeLanguage;
        const languageName = t(language === 'en' ? 'locale.english' : 'locale.french');

        return (
          <button
            key={language}
            type="button"
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)] focus-visible:ring-offset-1 ${
              active
                ? 'bg-[var(--vc-action-primary)] text-[var(--vc-action-primary-foreground)] shadow-sm'
                : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary'
            }`}
            aria-pressed={active}
            aria-label={active ? t('locale.current', { language: languageName }) : languageName}
            lang={language}
            onClick={() => selectLanguage(language)}
          >
            {language.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
