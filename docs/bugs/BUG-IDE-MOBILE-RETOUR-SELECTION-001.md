---
id: BUG-IDE-MOBILE-RETOUR-SELECTION-001
---

## Bug

Après ouverture de `audit.txt` depuis l’IDE desktop, passage à 768 px, changement de langue en français, bouton retour au tableau de bord puis retour navigateur, l’éditeur mobile affiche « Aucun fichier sélectionné ». Reproduit localement le 12 octobre 2026 pendant la vérification du cadre flottant, sur une branche issue de `dfd1d1f071a2e19a516833e8fff491fb5a818bd0` avec le correctif géométrique local. La capture confirme l’absence de sélection, pas une perte du fichier.

## 📤 Dispatché

☑ — constat transmis au parent pendant l’audit du volet flottant.

## 💻 Codé

☐ — non corrigé ; cause non établie. Le cadre desktop est absent dans la vue mobile ; aucun lien causal démontré avec le correctif géométrique.

## ✅ Testé live

☐ — reproduction locale uniquement, production non testée.

## Preuve et périmètre

L’assertion de restauration automatique de `.cm-content` échoue après 10 secondes. Capture inspectée : [aucun fichier sélectionné](../reprise/captures/flottant-2026-10-12/mobile-retour-selection-absente.png). Trace et journal conservés sous `/tmp/floating-viewport-evidence/green-complete/` et `/tmp/floating-viewport-evidence/green-complete.log` ; le nom historique de ce répertoire ne signifie pas réussite. Copie exacte du test de cette contre-épreuve : `/tmp/floating-viewport-tests/mobile-navigation-selection.spec.ts`.

Le test de géométrie vérifie séparément l’accessibilité du document par une réouverture explicite et systématique depuis le menu Fichiers. Ce parcours ne valide pas la restauration automatique et ne remplace pas cette contre-épreuve. Save et preview restent hors périmètre validé.

## Variante au changement de langue

Deux scénarios indépendants à 768 et 390 px reproduisent aussi une sélection de `README.md` après rechargement par `?lang=fr`, alors que `audit.txt` était ouvert. Assertion après 10 s : reçu `# File tab identity audit` au lieu du marqueur du fichier. Logs/traces `/tmp/floating-viewport-evidence/final-first/` ; test exact `/tmp/floating-viewport-tests/mobile-locale-selection.spec.ts`. La capture 390 px a été inspectée. Cause non établie et défaut non corrigé. La réouverture explicite vérifie l’accès au document après langue comme après navigation, sans revendiquer sa restauration automatique.

Copies durables des assertions de contre-épreuve (hors collecte E2E) : [navigation](../reprise/mesures/flottant-2026-10-12/mobile-navigation-selection.spec.ts.txt), [langue](../reprise/mesures/flottant-2026-10-12/mobile-locale-selection.spec.ts.txt). [Capture README après langue](../reprise/captures/flottant-2026-10-12/mobile-langue-readme.png).

## Complément local du 13 octobre — choix identique explicite

Sur #732, arbre 66616e33, cliquer explicitement le README déjà affiché provisoirement puis quitter immédiatement peut conserver l’ancienne sélection audit.txt. Reproduit à 390 et 768 ; aucune perte du contenu démontrée. Correctif local en cours, non poussé ni fusionné : persister le choix explicite même sans changement de chemin, avec garde du scope restauré. [Rapport et contre-épreuves](../reprise/2026-10-12-restauration-selection-mobile.md#choix-explicite-du-readme-provisoire--13-octobre-2026). Les validations et limites y sont consignées séparément ; aucun statut de production changé.
