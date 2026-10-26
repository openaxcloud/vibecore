# Lot local Support / Quota

Ce lot reste local, sans PR ni fusion : priorité donnée à la résolution CI #798 et à la livraison du descendant de #797. Il complète le correctif de marges latérales déjà conservé dans `../ui-safe-content-2026-10-26/`.

## Défauts corrigés

- Quota : les deux liens d'action mesuraient 34 px sur grands écrans avec la taille de police racine existante. Le minimum devient explicitement 44 px. Commit local `e35d1cf7d`.
- Support détail : un départ ou le remplacement du formulaire par un skeleton pouvait perdre le brouillon. État conservé dans le parent, garde existante avant départ, confirmation d'abandon, contenu maintenu pendant revalidation. L'action frontend renvoie un acquittement explicite pour le formulaire JS après réussite de l'API ; le formulaire document HTML conserve sa redirection. Un texte modifié pendant l'envoi n'est pas effacé par l'acquittement. Aucun changement du backend, aucune persistance nouvelle. Commit local `d6d426f30`.

## Validation disponible

- Support : 28 tests / 2 fichiers ; Quota/Downgrade : 18 tests / 2 fichiers. Tests existants adaptés et tests DataRouter ciblés, pas de suite parallèle redondante.
- Build regroupé, typage web strict, lint global : réussis. Lint : zéro erreur, 52 avertissements préexistants. Prettier : six fichiers du delta conformes. Gitleaks complet : aucune fuite, sans exception nouvelle.
- Revue indépendante du code Support favorable, avec contrôle des succès rapides/lents, erreurs, envois successifs, édition pendant envoi et abandon A→B→Retour A.
- [Support](support-detail/README.md) : recette Chromium compilée locale, quatre groupes navigation/langue/thème et huit scénarios d'envoi synthétique, plus contrat HTML. Neuf POST traités uniquement par une fixture locale en mémoire ; quatre PATCH de préférence interceptés avant traitement. Aucune action cliente réelle.
- [Quota/Downgrade](quota-downgrade/README.md) : 44 observations Quota après correction sur 11 formats, 88 mesures des deux liens ≥44 px, quatre parcours clavier/Retour. Les observations Downgrade antérieures restent datées et ne sont pas recomptées comme une exécution après correction.

Les reçus distinguent observations géométriques, parcours navigateur et tests automatisés ; leurs totaux ne sont pas additionnés comme un nombre de pages certifiées. Voir la [matrice complémentaire](../ui-safe-content-2026-10-26/coverage-overlay-support-quota.md).

## Limites et suite

Pas de recette authentifiée en production, de vrai backend Support, d'achat ni de changement d'abonnement. Pas de certification globale des contrastes, de Safari/Firefox, de lecteur d'écran ou de clavier virtuel physique. Zoom natif à 200 % non exercé sur ces trois nouvelles routes ; les redimensionnements pendant saisie Support sont exercés. Un arrêt complet du navigateur ne conserve pas le brouillon ; le garde beforeunload dépend du navigateur. Un envoi accepté dont l'acquittement réseau est perdu ne peut pas être reconnu avec certitude par cette garde UI.

L'index commun et les états « codé main / testé live » ne sont pas modifiés pendant la priorité #798. À libération : vérifier main et les PR concurrentes, intégrer le correctif CI sans doublon, compléter les fiches/index, ouvrir une PR brouillon puis suivre ses validations et la livraison normale. Aucun contournement de validation ou refus.
