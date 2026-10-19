---
id: BUG-IDE-PALETTE-HANDOFF-001
section: "2026-10-18 — Vérification avant commercialisation"
---

## Bug

P2 — La palette « Add tab » ouverte pendant le chargement initial de l'IDE disparaît lorsque `PendingComposerShell` est remplacé par le Chat définitif. L'ouverture était un état local d'`IdeTabBar`, perdu avec son nœud. Le wrapper et son menu intérieur sont rendus ensemble ; leur absence ne prouve pas un chargement différé du menu.

La perte est reproduite localement en retenant puis délivrant une vraie réponse HTTP `ide-state` 200, sans changer son contenu : ancienne feuille, bouton et palette déconnectés ; nouveau bouton fermé ; nouveau clic ouvrant normalement le menu. Thème sombre inchangé. Le build témoin vient de `1d2755086` ; huit sources pertinentes ont été comparées octet pour octet avec main `c4211323345` et sont identiques.

Le [run main 39168587722](https://github.com/openaxcloud/vibecore/actions/runs/39168587722) présente un échec du test « IDE applies section 12 UI detail styles ». Ses erreurs sont compatibles avec une disparition entre deux observations, mais son rapport navigateur n'a pas été inspecté : **la cause de ce run reste non attribuée**. Cette fiche ne clôt pas les échecs du panneau base de données.

## 📤 Dispatché

📤 Pris en charge le 18/10/2026, correction isolée de la durée de vie de la palette.

## 💻 Codé

☑ Fusionné dans main par [#740](https://github.com/openaxcloud/vibecore/pull/740), `bb70c7b68`, le 19 octobre à 00:44:41 UTC. Livraison refusée par le gate E2E à 01:10:27 UTC ; non attesté en production.

`IdePaletteProvider`, placé dans la route au-dessus des fallbacks ClientOnly/Suspense, conserve ouverture et recherche pendant le remplacement des coques. Le contexte est isolé par projet, fenêtre et panneau ; il disparaît à la sortie de l'IDE. Fermer la palette efface sa recherche, et retirer un panneau invalide sa palette. Le démontage transitoire d'une coque n'efface rien. Les usages sans provider gardent leur état local. Aucun stockage local, serveur ou global ajouté.

Le contexte des commandes est séparé de celui de l'état : modifier la recherche ne réveille pas le gros composant propriétaire de la disposition. Les classes, couleurs et comportements de fermeture existants restent utilisés. Les assertions, délais, retries, waivers et contrôles CI historiques restent inchangés. Le lecteur de styles de `dashboard.spec.ts` est corrigé séparément après attribution locale d’une lecture sur un nœud détaché : [preuve](BUG-IDE-STYLE-DETACHED-MENU-001.md). Le nouveau scénario multiétapes dispose de sa propre borne de 120 s ; il conserve la borne par défaut de 5 s de l’assertion qui échoue sur le témoin.

## ✅ Testé live

☐ Aucun déploiement ni contrôle en production. Les preuves locales ne sont pas une attribution de l'échec CI.

## Preuve

- Régression déterministe `tests/e2e/ide-palette-handoff.spec.ts` : contre l'ancien build, rouge en 17,4 s sur `aria-expanded` attendu `true`, reçu `false`, après remplacement attesté de l'ancien nœud ; aucune réponse fabriquée. Le test exige aussi la recherche conservée, Escape, fermeture explicite et non-réapparition après un autre projet.
- `IdePaletteState.spec.tsx` vérifie remplacement réel de nœuds React, fermeture, isolation projet/fenêtre, sortie de route, suppression/réutilisation d'un panneau et fallback local. Dix nouveaux cas (dont les panneaux principal, scindé et flottant avec pruning actif) et neuf témoins existants du layout passent : 19/19, un worker. Le reset SPA projet/fenêtre est prouvé par le provider React ; la navigation entre projets du scénario navigateur utilise des chargements complets.
- Sur le candidat palette isolé `4cce474b`, le nouveau scénario passe sans retry en 20,2 s. Un second passage, nécessaire pour enregistrer les captures, passe les deux cas distincts : `dashboard.spec.ts:1507` inchangé en 12,7 s, puis la nouvelle régression en 20,4 s (36,4 s au total, un worker). Le test historique valide les styles ; ce passage local ne démontre pas la cause des échecs CI ni leur disparition sous toutes les charges.
- Captures avant/après du témoin et du correctif inspectées, à 1440 × 900 sous Chromium : la palette corrigée reste complète, la recherche « Database » est conservée. Aucune preuve Safari, mobile ou production ajoutée.
- Les deux projets de la nouvelle régression ont été supprimés avec HTTP 200/200. Le projet du test historique a aussi reçu DELETE 200 ; le script temporaire a ensuite échoué en appelant `Response.status()` au lieu de lire `.status`. Une vérification **en lecture seule**, limitée à ce projet QA de cette exécution, confirme `deletedAt` et corrèle le DELETE 200. Le wrapper a donc rendu 1 après deux tests verts ; cet échec de comptabilisation n'est pas présenté comme un échec du produit ni effacé des journaux.
- Services locaux nettoyés : zéro processus actif possédé, quatre zombies repris par PID 1, ports 3301/3173 refusant les connexions. Mémoire mesurée avant les validations lourdes ; le dernier passage navigateur observe au plus 7,02 Go pour le conteneur sur 16 Gio. QA locale jetable, sans fournisseur IA, paiement, cloud ni données client.
- Validation finale : 19/19 tests provider/layout, 16/16 tests du générateur d'index, ESLint des cinq fichiers TypeScript touchés à zéro diagnostic, typecheck intégral `tsconfig.web.json` avec TypeScript 5.8.3 du dépôt, typage séparé du provider et des nouveaux tests, build client/SSR vert. Les cibles Electron et services du wrapper typecheck monorepo n'ont pas été rejouées pour ce changement web.

Commandes de validation :

```sh
pnpm exec vitest run app/components/chat/IdePaletteState.spec.tsx app/components/chat/ide-layout-handoff.spec.ts app/components/chat/ide-layout-restore.spec.ts --maxWorkers=1 --minWorkers=1
pnpm exec vitest run scripts/migrer-inventaire-bugs.spec.mjs --maxWorkers=1 --minWorkers=1
pnpm exec tsc --project tsconfig.web.json --noEmit --pretty false
pnpm run build
node scripts/migrer-inventaire-bugs.mjs --index
```

Preuves locales de la session : `/tmp/vibecore-palette-regression-red/probe.log`, `/tmp/vibecore-palette-regression-green-captures/probe.log`, captures dans le sous-dossier `screenshots`, vérifications de nettoyage `cleanup-verification.json` et `dashboard-cleanup-verification.json`. La configuration Playwright temporaire sélectionne uniquement les deux titres cités, avec Chromium système, un worker et zéro retry. Les sources testées sont empreintées dans `/tmp/vibecore-palette-final-source-hashes.json`.

Validation finale du lot intégré : [88 tests ciblés, typage/build et deux cas Chromium sans retry, captures et nettoyage](../reprise/mesures/2026-10-18-ide-recovery-integrated.json). Aucun résultat live ajouté.
