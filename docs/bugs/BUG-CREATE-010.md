---
id: BUG-CREATE-010
---

## Bug

**P0 — rouvrir un projet sur un NOUVEL appareil efface le workspace et le reconstruit.** Trace réelle à la réouverture en mobile 390 : `GET /files?path=.` (les fichiers sont là), puis `POST /api/runtime/workspaces`, puis **`DELETE` de chaque fichier** (`README.md`, `index.html`, `package-lock.json`, `package.json`, `src`, `vite.config.ts`), puis `POST /import?targetPath=.`. L'arbre clignote 9 → 8 → 9, `package-lock.json` est détruit, et aucun aperçu n'apparaît en 68 s. **Cause** : la décision de rattachement est `reused && seededThisSession`, et `seededThisSession` vient d'un marqueur `localStorage` **local au navigateur**. Vérifié en deux temps sur le même navigateur : 1ʳᵉ ouverture `seededThisSession:false` → 6 `DELETE` + 1 import ; réouverture `seededThisSession:true` → **0 `DELETE`, 0 import**. Donc le mécanisme marche, mais **tout appareil qui n'a jamais ouvert ce projet reconstruit** — c'est exactement le cas d'Avi qui teste sur son téléphone. ⚠️ Même après un rattachement réussi, **aucun aperçu ne s'affiche** (0 iframe).

## 📤 Dispatché

☑

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 17/08**

## Preuve

`reouverture-390.json` (trace des DELETE), sortie du test en deux temps, trace `[workspace] reattach decision` **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/lib/.server/llm/anthropic-thinking-effectivity.spec.ts`, `app/lib/runtime/workspace-reseed.spec.ts`, `services/api/src/ide-state-files-guard.spec.ts`, `services/api/src/project-manifest-durability.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.


### Garde de conservation local — 2026-11-15

📤 Dispatché : garde sur base `3f5ce0261a3b1fc97694f904555d6a6916922640`.
💻 Codé : candidat local uniquement, non commité/non poussé.
✅ Testé live : non ; vérifications unitaires synthétiques uniquement.

Une archive illisible, ou un parcours runtime incomplet, bloque
le reseed avant suppression/import. Le flux partagé propage une erreur typée de préflight vers son erreur workspace existante et ne marque pas le seed réussi.
Une archive ZIP valide vide est un no-op seulement sur un arbre vide : aucun
import ni message « fichiers synchronisés ». Sur un arbre non vide, elle échoue
sans supprimer les fichiers. Ce choix conservateur peut bloquer un projet vide
sur un runtime prérempli ; il ne constitue pas une autorisation de nettoyage.
Le contrôle valide non vide conserve le plan sélectif existant.

Limites : décision reattach inchangée, aucune récupération Aster. Les échecs
pendant suppressions/import d'une archive valide restent non atomiques ; les
écritures concurrentes après le parcours ne sont pas clôturées par ce garde.
Ce chantier nécessite une conception séparée, sans nouveau wipe de repli.
Le flux factorisé est testé en comportement : les refus de préflight et le
no-op vide préservent aussi l’aperçu ; stopPreview ne vient qu’après le plan
complet, avant la première mutation. Seules les erreurs typées de préflight
échappent au teardown existant. Les erreurs d’écriture gardent leur identité.
Le branchement du catch provider est un contrat de source, pas une preuve navigateur.
Aucun contrôle CRC exhaustif ni décompression eager ajoutée : le ZIP est lu
pour déterminer les chemins, sans preuve d’intégrité de l’import.

Revue de portée : le provider capture le compteur de liaison runtime/projet
existant, combiné à son annulation. Le flux vérifie la portée avant stopPreview,
après son await, avant chaque suppression/import et avant le résultat. Le
marqueur seed, les erreurs et le loading ne sont pas publiés par une génération
obsolète. L’arrêt d’aperçu accepte ce contrôle de portée en plus de son epoch
existant, y compris lors d’un changement de projet sur le même adapter. Un
provider obsolète ne déclenche plus de stopRemoteWorkspace sur ses retours
d’annulation : il ne peut pas distinguer un workspace désormais adopté. Le
nettoyage normal/inactivité reste en place ; aucun nouveau teardown n’est ajouté.
Ce contrôle local ne clôture pas les requêtes réseau déjà parties.
La suite web complète v2 a été interrompue pour cette revue (SIGINT, code 130) ;
aucune suite complète v3 avant revue.
