# Audit français : pluriel « files d’attente »

Base isolée279440d2f, branche fix/fr-audit-queue-expression-20261026. Contrôle frais32PR ouvertes, fichiers paginés : aucun chevauchement du helper ni de sa suite existante (open-pr-files.json). Instructions AGENTS lues ; aucune modification pipeline, testsE2E, texteBlog, backend ou renderer.

## Cause prouvée

AuditFR40269242481, jobs desktop1024 121398601225 et tablet768 121398601441 : « /blog/building-at-scale-how-we-handle-10m-requests (light/dark) contains1untranslated/raw French DOM entries », puis `forbidden-term: Utiliser des files d’attente pour les traitements longs @ section:nth-of-type(3) > article:nth-of-type(3) > ul > li:nth-of-type(3) > span`. Extraits obtenus par connecteur GitHub en lecture seule, aucune relance effectuée.

Le helper `app/lib/i18n/catalogs/live-audit-heuristics.ts:105` exclut déjà l’expression française singulière `file d’attente` du contrôle terminologique ; le pluriel reste interprété comme l’anglais `files`. Le texteBlog est correctement français et reste inchangé.

## Delta et validation

Exception existante `file`→`files?`, apostrophes droite/courbe conservées, phrase entière seulement. L’anglais files n’entre pas dans la liste générale des mots approuvés. Les autres signaux anglais continuent d’être calculés sur le texte original.

Suite existante `tests/i18n/live-audit-heuristics.spec.ts` enrichie de9cas :4positifs(pluriel apostrophesdroite/courbe, casse, singulier+pluriel) et5négatifs(files/file isolés, expressionFR+files/dashboard, expressionmalforméeattentes). Avant :4échecs et71succès. Après :112tests verts sur5suites, dont75heuristique et37tests consommateurs (audit-shell-path17, tarifs8, glossarysolutions11, provider1). Aucun test supprimé, skip/waiver ou assertion affaiblie.

ESLint etPrettier ciblés2fichiers :0. Typage strict ciblé helper+suite :0 via tsconfig.json archivé (extends configdépôt, types[] pour ne pas charger les globalsruntime étrangers à ce module pur) ; ce n’est pas le typageglobal du dépôt. Aucun build produit ni navigateur relancé, puisque la recherche `live-audit-heuristics|findFrenchAuditResidue|isApprovedAuditText` (import-usage.txt) trouve seulement des consommateurs de test et l’entrée d’exclusion de l’outil dans modules-morts. Le placement app/ ne constitue pas à lui seul un import runtime.

Les logs txt ont uniquement leurs espaces de fin de ligne et lignes blanches finales normalisés pour diff--check. Le fichier tsconfig archivé conserve les chemins exacts utilisés pour provenance. Revue indépendante parent requise avant intégration. Aucun push/index documentaire ; auditCI complet après intégration reste nécessaire, sans revendiquer correction des autres éventuels résidus ni modification du produit.

## Revue indépendante reçue

Parent/root a relu le diff helper et test : avis favorable, exception strictement limitée à la phrase française singulier/pluriel, gardes anglais file/files/mixed conservés, aucun contournement pipeline. Commit local autorisé ; auditCI complet et intégration restent distincts de cet avis source.
