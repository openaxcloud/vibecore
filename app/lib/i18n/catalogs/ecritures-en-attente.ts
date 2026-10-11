import { normalizeSupportedLanguage } from '~/lib/i18n/language';

/*
 * BUG-QA0928-RUNTIME-ID-PROJET — ce que l'utilisateur lit quand les fichiers de
 * l'agent n'ont pas pu être écrits parce que l'espace de travail n'a pas démarré.
 *
 * Même règle que « la génération s'est arrêtée en route » (applied-files-toast) :
 * dire ce qui s'est passé ET quoi faire, sans code ni statut HTTP.
 */
export const ecrituresEnAttenteEn = {
  'ecrituresEnAttente.titre_one': '{count} file could not be written yet',
  'ecrituresEnAttente.titre_other': '{count} files could not be written yet',
  'ecrituresEnAttente.quota':
    'Your plan allows one running workspace at a time, and another of your projects is still open. Close that project or upgrade your plan, then click “Restart workspace”.',
  'ecrituresEnAttente.demarrage': 'The workspace did not start. Click “Restart workspace” to try again.',
  'ecrituresEnAttente.conserves':
    'Nothing is lost: the files are kept in this browser and will be written as soon as the workspace starts.',
  'ecrituresEnAttente.nonConserves':
    'This browser could not keep a copy: the files are still in the conversation, so keep this tab open until the workspace starts.',
  'ecrituresEnAttente.redemarrer': 'Restart workspace',
  'ecrituresEnAttente.rejoues_one': '{count} kept file was written to the workspace.',
  'ecrituresEnAttente.rejoues_other': '{count} kept files were written to the workspace.',
  'ecrituresEnAttente.quotaAvantEnvoi':
    'The agent cannot write files right now: your plan allows one running workspace at a time, and another of your projects is still open. Close that project or upgrade your plan, then click “Restart workspace”.',
} as const;

export type EcrituresEnAttenteKey = keyof typeof ecrituresEnAttenteEn;
export type EcrituresEnAttenteCopy = Readonly<Record<EcrituresEnAttenteKey, string>>;

export const ecrituresEnAttenteFr: EcrituresEnAttenteCopy = {
  'ecrituresEnAttente.titre_one': '{count} fichier n’a pas encore pu être écrit',
  'ecrituresEnAttente.titre_other': '{count} fichiers n’ont pas encore pu être écrits',
  'ecrituresEnAttente.quota':
    'Votre forfait permet un seul espace de travail actif à la fois, et un autre de vos projets est encore ouvert. Fermez ce projet ou passez à un forfait supérieur, puis cliquez sur « Redémarrer l’espace de travail ».',
  'ecrituresEnAttente.demarrage':
    'L’espace de travail n’a pas démarré. Cliquez sur « Redémarrer l’espace de travail » pour réessayer.',
  'ecrituresEnAttente.conserves':
    'Rien n’est perdu : les fichiers sont conservés dans ce navigateur et seront écrits dès que l’espace de travail démarrera.',
  'ecrituresEnAttente.nonConserves':
    'Ce navigateur n’a pas pu en garder une copie : les fichiers restent dans la conversation, gardez cet onglet ouvert jusqu’au démarrage.',
  'ecrituresEnAttente.redemarrer': 'Redémarrer l’espace de travail',
  'ecrituresEnAttente.rejoues_one': '{count} fichier conservé a été écrit dans l’espace de travail.',
  'ecrituresEnAttente.rejoues_other': '{count} fichiers conservés ont été écrits dans l’espace de travail.',
  'ecrituresEnAttente.quotaAvantEnvoi':
    'L’agent ne peut pas écrire de fichiers pour l’instant : votre forfait permet un seul espace de travail actif à la fois, et un autre de vos projets est encore ouvert. Fermez ce projet ou passez à un forfait supérieur, puis cliquez sur « Redémarrer l’espace de travail ».',
};

export function getEcrituresEnAttenteCopy(language?: string | null): EcrituresEnAttenteCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? ecrituresEnAttenteFr : ecrituresEnAttenteEn;
}

/** Choisit la forme `_one` / `_other` selon les règles de pluriel de la langue. */
export function formatEcrituresEnAttentePluriel(
  language: string | null | undefined,
  count: number,
  formes: { one: string; other: string },
): string {
  const langue = normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
  const forme = new Intl.PluralRules(langue).select(count) === 'one' ? formes.one : formes.other;

  return forme.replace('{count}', String(count));
}
