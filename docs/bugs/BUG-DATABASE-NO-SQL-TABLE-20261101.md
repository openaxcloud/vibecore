---
id: BUG-DATABASE-NO-SQL-TABLE-20261101
---

# Database : créer une table sans saisir de SQL

📤 Dispatché : ☑

💻 Codé : ☐ main — PR #870 en validation.

✅ Testé live : ☐ production — recettes locales isolées seulement.

Base : PR #864, `fdc02d93f564570ddabb49a8706583d00193a0e4`. Ce complément préserve son isolation des connexions, l'échappement des identifiants et les mises à jour par clé primaire. Le proxy Database récupère les erreurs de requête sans démonter le formulaire ; aucun changement du backend Fastify, Git, Skills ou génération Agent.

## Lacune et changement

La création exigeait du SQL dans le studio. Un formulaire PostgreSQL propose maintenant le nom de table, le schéma (public par défaut), des colonnes et types libellés en français/anglais, ainsi qu'un identifiant unique automatique. Seule une connexion explicitement déclarée PostgreSQL active ce parcours.

La soumission passe par le proxy et l'API existants ; les permissions existantes restent requises. Génération d'un CREATE TABLE unique, types fermés, identifiants échappés et limités à 63 octets UTF-8, doublons et caractères de contrôle refusés. Aucun remplacement ni IF NOT EXISTS trompeur. Aucune soumission automatique. Une réponse tardive ne cible pas une autre connexion. Le brouillon reste sur erreur ; succès seulement si PostgreSQL confirme CREATE. Fermer après succès n'annonce pas un rollback.

## Preuves et limites

Le reçu [HTTP/PostgreSQL](database-table-form-evidence-20261101/http-proof.json) confirme création HTTP via la vraie API Fastify et le générateur, lecture indépendante des colonnes/identity/NOT NULL, rejet d'un doublon et conservation de la ligne existante. PostgreSQL 16.15 natif local dédié, données synthétiques uniquement. Les identités et métadonnées projet de cette recette sont dans TestApiStore en mémoire : pas de preuve Prisma persistante ou de migration production.

Validations locales : **149 tests Database/proxy**, **16 tests inventaire**, typage web et compilation client/SSR réussis. Lint : zéro erreur, deux avertissements préexistants de fonctions vides. Revue indépendante : 17 tests proxy/formulaire réussis et contrôle des permissions/masquage. Réserve mineure : le retour 429 conserve le statut mais ne retransmet pas Retry-After ; aucun retry automatique ajouté.

| Recette Chromium local compilé | 390×844 | 768×1024 | 1440×1000 |
| --- | --- | --- | --- |
| Création par formulaire, identité/clé primaire/NOT NULL relus dans PostgreSQL | réussi | réussi | réussi |
| Doublon, brouillon et ligne existante conservés | réussi | réussi | réussi |
| Annuler sans création, schéma retrouvé après rechargement | réussi | réussi | réussi |
| Redimensionner pendant saisie, sans perte de brouillon | réussi | réussi | réussi |
| Confinement horizontal, capture | réussi | réussi | réussi |

[Reçu navigateur](database-table-form-evidence-20261101/browser-receipt.json), captures et script joints. Le compteur `requests` du premier script ne reconnaît pas le suffixe React Router `.data` : ne pas l'utiliser comme preuve du nombre de requêtes. Les écritures et contraintes sont vérifiées indépendamment dans PostgreSQL. Les appels externes/IA sont bloqués.

[Zoom natif Chromium 200 %](database-table-form-evidence-20261101/zoom-keyboard-receipt.json) : viewport physique 1440, innerWidth 720, DPR 2, CSS zoom 1 ; saisie clavier, types, case à cocher et Annuler réussis, pas de soumission. Retour/Avancer à ce zoom retrouve Database sans restaurer le brouillon annulé ([reçu](database-table-form-evidence-20261101/back-forward-receipt.json)). WebKit absent, Safari physique non testé. La recette ne prouve pas toutes les tailles, langues et thèmes.

Avant correction, le sélecteur strict Type échouait sur les trois formats ; la relecture du DOM a établi le libellé accessible ambigu, corrigé sans élargir le sélecteur. L'exploration suivante a réellement créé une table, puis reproduit une page globale ERROR500 au doublon : le proxy lançait l'erreur au lieu de retourner des données de formulaire. Après correction, la recette stricte complète passe directement dans les trois formats. Un premier lancement après build a échoué avant écoute du serveur (ERR_CONNECTION_REFUSED, aucun parcours exécuté) ; la recette identique a repris après readiness HTTP200. Une invocation initiale incorrecte du test inventaire via node --test a échoué avant tests ; exécuté avec Vitest, ses 16 tests passent.

L'isolation des réponses entre connexions est testée au niveau composant React avec API synthétique ; la recette navigateur réelle utilise une connexion locale et ne prouve pas l'isolation multi-tenant de production. CI exacte encore à suivre avant intégration.

## Critères de lancement encore non prouvés dans ce périmètre

1. Création/ouverture de projet avec métadonnées persistantes après redémarrage du backend sur l'assemblage final.
2. Git : connexion OAuth, sélection/import du dépôt et persistance réelle sur l'assemblage ; aucune nouvelle autorisation OAuth testée ici.
3. Database : provisioning cloud, permissions réelles des rôles et migrations de production ; aucune donnée cliente utilisée.
4. Database : insertion de lignes sans SQL, autres dialectes et restauration PITR restent hors de ce formulaire PostgreSQL.
5. Skills : activation/ressources sur l'assemblage #863/#865/#867 ; ne pas substituer l'ancien main à cet assemblage.
6. Navigation : réserves Retour/Avancer et Escape1180 non reproduites ; les diagnostics précédents restent ouverts, sans nouveau correctif spéculatif.
7. Safari physique/WebKit, zoom200%, thèmes/langues et interruptions : ne revendiquer que les cases effectivement exécutées dans le reçu navigateur.
8. Livraison : validations exactes de la nouvelle tête puis intégration/déploiement sérialisés par le coordinateur ; aucune livraison autonome.

## Complément de validation après publication

La première tête c057bc30d échoue au garde i18n (job124805279667, run41292106015) : libellés du formulaire hors catalogue et codes techniques considérés comme texte visible. Les tests unitaires globaux, intégration et build CI ne sont pas exécutés sur cette tentative. La correction raccorde le catalogue existant et nomme explicitement les codes d'erreur techniques ; aucun seuil, baseline ni allowlist modifié.

Une recette supplémentaire utilise le générateur SQL produit puis redémarre réellement PostgreSQL : la ligne synthétique, identity et NOT NULL sont conservés ([reçu](database-table-form-evidence-20261101/persistence-restart-receipt.json)). Ce complément utilise directement PostgreSQL, pas HTTP/navigateur. Le premier essai ne trouvait plus la fixture : le nettoyage normal de l'API avait retiré ses schémas et fichier de session. Un nouveau schéma isolé a été créé pour cette preuve puis supprimé. Ce n'est pas une preuve de persistance des identités/projets.

Pour les huit critères :
- Compte/projet et permissions réelles : bancs Prisma existants (`prisma-store.spec.ts`, `database-panel-browser-local.ts`), mais pgvector/HNSW requis par les migrations0010/0035 et absent du PostgreSQL natif. Réutiliser le service pgvector du workflow existant sur l'assemblage final ; ne pas amputer les migrations.
- Git et Skills : recettes locales possibles après assemblage/coordination de leurs propriétaires. OAuth réel exige une connexion déjà autorisée ; aucune nouvelle connexion créée ici.
- Insertion sans SQL, autres dialectes et PITR : fonctionnalités distinctes du formulaire de table, encore non prouvées.
- Navigation et compatibilité : poursuivre les cas bornés réellement démontrés, sans attribuer les flakes anciens à ce lot. FR/EN, thèmes et formats supplémentaires sont testables sans production ; Safari physique reste externe.
- Livraison : attendre CI exacte puis intégration sérialisée par le coordinateur.

Après raccord catalogue : 28 tests ciblés, typage web, compilation client/SSR, validation des catalogues et scan source réussis. Une revue indépendante confirme le maintien du contrat SQL et des contrôles. [16 cas compilés FR/EN × clair/sombre × 320×568,820×1180,1180×820,844×390](database-table-form-evidence-20261101/i18n-theme-receipt.json) passent directement : clavier, actions accessibles après scroll, confinement horizontal, brouillon au redimensionnement et annulation. Aucun formulaire soumis dans ce complément ; aucun contraste WCAG numérique ni Safari physique certifié.
