import { useTranslation } from 'react-i18next';

import {
  clearUserLanguagePreference,
  normalizeSupportedLanguage,
  setUserLanguagePreference,
  USER_LANGUAGE_COOKIE,
  USER_LANGUAGE_STORAGE_KEY,
  type SupportedLanguage,
} from '~/lib/i18n/language';

/**
 * Réglage « Langue » des Paramètres de l'IDE.
 *
 * Remplace la bascule FR/EN qui occupait la barre de l'IDE. La langue est
 * détectée depuis le navigateur au chargement ; ce réglage n'existe que pour
 * SURCHARGER cette détection, ce qui en fait un choix rare — sa place est dans
 * les Paramètres, pas dans une barre permanente.
 *
 * Trois valeurs, et « Automatique » compte autant que les deux autres : sans
 * elle, un utilisateur ayant choisi une fois resterait figé, puisque le cookie
 * de choix explicite gagne sur `navigator.language`.
 */
const VALEUR_AUTO = 'auto';

type Choix = typeof VALEUR_AUTO | SupportedLanguage;

/**
 * Y a-t-il un choix explicite enregistré ? On lit les mêmes deux sources que
 * `detectUserLanguage`, dans le même ordre : ce qui n'est PAS un choix explicite
 * (cookie de détection, `navigator.language`) doit s'afficher « Automatique »,
 * sinon le réglage prétendrait qu'un choix a été fait alors que non.
 */
export function readExplicitLanguageChoice(): SupportedLanguage | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  if (typeof globalThis.document !== 'undefined') {
    for (const segment of (globalThis.document.cookie ?? '').split(';')) {
      const trimmed = segment.trim();

      if (trimmed.startsWith(`${USER_LANGUAGE_COOKIE}=`)) {
        const brut = trimmed.slice(USER_LANGUAGE_COOKIE.length + 1);

        let valeur = brut;

        try {
          valeur = decodeURIComponent(brut);
        } catch {
          /* valeur laissée telle quelle */
        }

        const normalise = normalizeSupportedLanguage(valeur);

        if (normalise) {
          return normalise;
        }
      }
    }
  }

  if (typeof globalThis.localStorage !== 'undefined') {
    try {
      return normalizeSupportedLanguage(globalThis.localStorage.getItem(USER_LANGUAGE_STORAGE_KEY));
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function LanguageSetting({ className = '', id }: { className?: string; id?: string }) {
  const { t } = useTranslation();
  const choixCourant: Choix = readExplicitLanguageChoice() ?? VALEUR_AUTO;

  const appliquer = (choix: Choix) => {
    if (choix === choixCourant) {
      return;
    }

    if (choix === VALEUR_AUTO) {
      clearUserLanguagePreference();
    } else {
      setUserLanguagePreference(choix);
    }

    /*
     * La préférence compte est mise à jour au mieux : elle donne la même langue
     * aux courriels et aux travaux de fond. `auto` n'y est pas envoyé — c'est un
     * état LOCAL (« pas de choix »), pas une langue que le serveur pourrait
     * appliquer à un envoi différé.
     */
    const persistance =
      choix === VALEUR_AUTO
        ? Promise.resolve()
        : fetch('/api/user/preferences', {
            method: 'PATCH',
            credentials: 'same-origin',
            keepalive: true,
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: JSON.stringify({ language: choix }),
          })
            .then(() => undefined)
            .catch(() => undefined);

    /*
     * Rechargement, pour la même raison que l'ancienne bascule : les métadonnées
     * rendues au serveur, `Content-Language`, `<html lang>` et le catalogue
     * client doivent changer ensemble. Un basculement uniquement client
     * laisserait la moitié de la page dans l'ancienne langue.
     *
     * On retire `?lang=` s'il traîne : ce paramètre l'emporte sur le cookie, et
     * le garder ferait revenir l'ancienne langue au rechargement — en
     * particulier après un retour à « Automatique ».
     */
    let recharge = false;

    const recharger = () => {
      if (recharge || typeof window === 'undefined') {
        return;
      }

      recharge = true;

      const cible = new URL(window.location.href);
      cible.searchParams.delete('lang');
      window.location.replace(cible.toString());
    };

    if (typeof window !== 'undefined') {
      window.setTimeout(recharger, 600);
    }

    void persistance.finally(recharger);
  };

  return (
    <select
      id={id}
      className={className}
      data-testid="ide-language-setting"
      aria-label={t('locale.switchLabel')}
      value={choixCourant}
      onChange={(event) => appliquer(event.target.value as Choix)}
    >
      <option value={VALEUR_AUTO}>{t('locale.automatic')}</option>
      <option value="fr">{t('locale.french')}</option>
      <option value="en">{t('locale.english')}</option>
    </select>
  );
}
