export const adminExplicitBudgetEn = {
  'adminExplicitBudget.title': 'Aster test envelope',
  'adminExplicitBudget.description':
    'Review and activate the one authorized project extension. This does not buy provider credits or start an AI run.',
  'adminExplicitBudget.back': 'Back to projects',
  'adminExplicitBudget.loading': 'Reading the project envelope',
  'adminExplicitBudget.refresh': 'Read the current state',
  'adminExplicitBudget.scope': 'Authorized project',
  'adminExplicitBudget.limit': 'Current ceiling',
  'adminExplicitBudget.reserved': 'Reservations retained',
  'adminExplicitBudget.nextRun': 'Maximum reservation for the next run',
  'adminExplicitBudget.calls': 'Maximum calls',
  'adminExplicitBudget.model': 'Configured model',
  'adminExplicitBudget.standard': 'Standard',
  'adminExplicitBudget.remaining': 'Remaining envelope',
  'adminExplicitBudget.proposal': 'Authorized extension: $20.00 → $30.52',
  'adminExplicitBudget.constraint':
    'One additional Lite / OpenAI / gpt-5.6-luna Standard run, at most $15.26 reserved and two calls. Historical reservations remain unchanged.',
  'adminExplicitBudget.unknownCosts':
    'Earlier Auto/provider costs are excluded. This is not a billing receipt or the total historical cost.',
  'adminExplicitBudget.password': 'Confirm with your current administrator password',
  'adminExplicitBudget.confirmation': 'I confirm the displayed Aster project and this one authorized extension.',
  'adminExplicitBudget.activate': 'Activate this extension',
  'adminExplicitBudget.submitting': 'Verifying and applying…',
  'adminExplicitBudget.granted': 'The authorized extension is recorded. No AI run has been started by this page.',
  'adminExplicitBudget.blocked': 'This project is not eligible for another extension. No change will be submitted.',
  'adminExplicitBudget.unavailable': 'The current state could not be verified. Read it again before any change.',
  'adminExplicitBudget.invalid-request': 'Confirm the displayed proposal and enter your administrator password.',
  'adminExplicitBudget.stale-review': 'The state changed since your review. Read it again and review the new values.',
  'adminExplicitBudget.not-eligible': 'The current project, routing card or reservation does not allow this extension.',
  'adminExplicitBudget.reauth-failed': 'Administrator reauthentication failed. No extension was submitted.',
  'adminExplicitBudget.outcome-unknown':
    'The result is not confirmed. Read the current state before deciding whether another submission is needed.',
  'adminExplicitBudget.forbidden': 'This action requires an authorized administrator session on this site.',
} as const;

export type AdminExplicitBudgetCopy = Record<keyof typeof adminExplicitBudgetEn, string>;
export const adminExplicitBudgetFr: AdminExplicitBudgetCopy = {
  'adminExplicitBudget.title': 'Enveloppe de recette Aster',
  'adminExplicitBudget.description':
    'Vérifiez puis activez l’unique extension autorisée pour ce projet. Cela n’achète aucun crédit fournisseur et ne lance aucun appel IA.',
  'adminExplicitBudget.back': 'Retour aux projets',
  'adminExplicitBudget.loading': 'Lecture de l’enveloppe du projet',
  'adminExplicitBudget.refresh': 'Relire l’état actuel',
  'adminExplicitBudget.scope': 'Projet autorisé',
  'adminExplicitBudget.limit': 'Plafond actuel',
  'adminExplicitBudget.reserved': 'Réservations conservées',
  'adminExplicitBudget.nextRun': 'Réservation maximale du prochain essai',
  'adminExplicitBudget.calls': 'Nombre maximal d’appels',
  'adminExplicitBudget.model': 'Modèle configuré',
  'adminExplicitBudget.standard': 'Standard',
  'adminExplicitBudget.remaining': 'Enveloppe restante',
  'adminExplicitBudget.proposal': 'Extension autorisée : 20,00 $ → 30,52 $',
  'adminExplicitBudget.constraint':
    'Un seul essai Lite / OpenAI / gpt-5.6-luna Standard supplémentaire, au plus 15,26 $ réservés et deux appels. Les réservations historiques restent inchangées.',
  'adminExplicitBudget.unknownCosts':
    'Les coûts antérieurs Auto/fournisseur sont exclus. Ce solde n’est ni une facture ni le coût historique total.',
  'adminExplicitBudget.password': 'Confirmez avec votre mot de passe administrateur actuel',
  'adminExplicitBudget.confirmation': 'Je confirme le projet Aster affiché et cette unique extension autorisée.',
  'adminExplicitBudget.activate': 'Activer cette extension',
  'adminExplicitBudget.submitting': 'Vérification et application…',
  'adminExplicitBudget.granted': 'L’extension autorisée est enregistrée. Cette page n’a lancé aucun appel IA.',
  'adminExplicitBudget.blocked':
    'Ce projet ne peut pas recevoir une autre extension. Aucune modification ne sera soumise.',
  'adminExplicitBudget.unavailable': 'L’état actuel n’a pas pu être vérifié. Relisez-le avant toute modification.',
  'adminExplicitBudget.invalid-request':
    'Confirmez la proposition affichée et saisissez votre mot de passe administrateur.',
  'adminExplicitBudget.stale-review':
    'L’état a changé depuis votre vérification. Relisez-le puis vérifiez les nouvelles valeurs.',
  'adminExplicitBudget.not-eligible':
    'Le projet, la carte de routage ou la réservation actuelle ne permet pas cette extension.',
  'adminExplicitBudget.reauth-failed':
    'La réauthentification administrateur a échoué. Aucune extension n’a été soumise.',
  'adminExplicitBudget.outcome-unknown':
    'Le résultat n’est pas confirmé. Relisez l’état actuel avant de décider si une nouvelle soumission est nécessaire.',
  'adminExplicitBudget.forbidden': 'Cette action nécessite une session administrateur autorisée sur ce site.',
};

export function getAdminExplicitBudgetCopy(language: string): AdminExplicitBudgetCopy {
  return language === 'fr' ? adminExplicitBudgetFr : adminExplicitBudgetEn;
}
