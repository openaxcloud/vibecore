---
id: BUG-IDE-PANEL-NAVIGATION-CONCURRENTE-001
---

## Constat

Sur téléphone ou tablette, ouvrir Fichiers puis choisir rapidement un fichier peut réafficher Library après que l’éditeur a montré ce fichier. La mémoire de sélection peut être correcte malgré le panneau incorrect.

## 📤 Dispatché

☑ — découvert pendant les contre-épreuves locales de #732 le 13 octobre 2026.

## 💻 Codé

☐ — correctif local avec contre-épreuve 2/2 verte, non poussé ni fusionné sur main.

## ✅ Testé live

☐ — reproduction locale uniquement, production non testée.

## Preuve et cause

Contre-épreuve aux largeurs 390 et 768 sur le build du correctif README 34f37088a : retenir la vraie réponse `ide.data?panel=files`, cliquer other.txt visible dans Library, puis libérer. L’éditeur montre SECOND-DOCUMENT avant libération ; la navigation retardée réimpose ensuite Library et l’assertion de contenu échoue dans les 5 s. Les deux tests durables sont rouges. Le garde de déduplication ne consulte que l’URL affichée (encore editor) et ignore files en cours de chargement ; il abandonne donc à tort la demande editor. Mécanisme présent dans dc200e09, distinct de la persistance de sélection.

Le correctif compare la destination en cours, si elle existe, au panneau demandé ; la référence du callback reste stable. Les re-clics réellement redondants restent inertes. La politique existante de revalidation du loader IDE est conservée, notamment pour une navigation vers l’URL identique. Les tests vérifient aussi l’absence de requête de loader pendant 250 ms après un re-clic une fois stabilisé ; cette observation est bornée à cette fenêtre.

[Rapport lié](../reprise/2026-10-12-restauration-selection-mobile.md). Preuves locales : `/tmp/mobile-selection-evidence/panel-race-red/` et `readme-nav-retained/`. Aucun menu bas ni assertion existante modifié.

Captures des deux rouges inspectées : [390](../reprise/captures/selection-mobile-2026-10-12/navigation-concurrente-rouge-390.png), [768](../reprise/captures/selection-mobile-2026-10-12/navigation-concurrente-rouge-768.png).

Validation finale locale : 15/15 parcours E2E, un worker, zéro retry, 3,7 minutes ; 96/96 tests ciblés, build, types web/E2E et lint verts. Relecture indépendante favorable. Aucun push ni fusion.
