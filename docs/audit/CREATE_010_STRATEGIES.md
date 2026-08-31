# BUG-CREATE-010 — amplification actuelle et stratégies de regroupement

Préparation du correctif, **sans le poser**. Chiffré autant que possible ; ce qui
n'a pas été remesuré aujourd'hui est marqué comme tel.

---

## 1. D'où vient l'amplification

### Le mécanisme, lu dans le code

`ActionRunner.runAction(data, isStreaming)` (`app/lib/runtime/action-runner.ts:499`)
est appelé **à chaque mise à jour du flux** pour une action de type `file`. Chaque
appel descend dans `#runFileAction`, qui écrit le contenu **partiel** courant :

```
runAction(isStreaming=true)  →  #runFileAction  →  runtime.writeFile(path, payload)
                                                →  PUT /api/runtime/workspaces/<ws>/files/write
```

Il existe deux mémos anti-doublon, et **aucun ne mord pendant le flux** :

| mémo | où | pourquoi il ne sert pas ici |
|---|---|---|
| `#lastWrittenContent` | `packages/runtime-remote/src/index.ts:411` | compare le contenu ; pendant le flux il diffère à chaque fragment |
| `#lastWrittenFingerprint` | `action-runner.ts:966` | même raison — l'empreinte change à chaque fragment |

Ils protègent des réécritures **identiques**, pas de la progression du flux. C'est
là toute l'amplification : **une requête HTTP par fragment et par fichier**.

### Ordre de grandeur

- **750 `PUT` pour 20 fichiers** (≈ **37 écritures par fichier**) — mesure du
  **2026-08-15**. ⚠️ **REMESURE TENTÉE LE 31/08, ÉCHOUÉE** : deux générations
  lancées sur la production, toutes deux interrompues par un bandeau **« Service
  unavailable »** avant la moindre écriture (`AMPLIFICATION requetes=0
  fichiers=0` — un zéro qui ne mesure rien, pas un zéro d'amplification). Voir
  `BUG-AGENT-007`. **Le chiffre reste donc celui du 15/08, et la décision ne doit
  pas être prise dessus sans une remesure aboutie.**
- Mesure connexe du 21/08, déjà corrigée : 468 `PUT` **tous en `425`**, sans aucun
  succès — c'était une tempête de reprises sur un espace pas encore prêt, réglée
  par le double budget de tentatives (`action-runner`, commentaire
  `BUG-AGENT-006 / BUG-AGENT-002`). **Ne pas confondre les deux** : celle-ci est
  éteinte, l'amplification de flux ne l'est pas.

### Ce qui la déclenche

| Déclencheur | Écritures | Rythme |
|---|---|---|
| génération de l'agent (flux) | ~37 par fichier | **machine**, quelques dizaines de ms entre fragments |
| sauvegarde manuelle (`Ctrl+S`) | **1** | **humain**, quelques par minute |
| réparation / doctor (`workbench.ts:3644-3705`) | 1 par fichier | ponctuel |
| réouverture (reseed) | 1 par fichier de l'archive | à l'ouverture |

---

## 2. Le point important : le chemin de l'agent n'a PAS besoin du correctif

L'archive **est déjà** rafraîchie pour l'agent, par
`POST /projects/:projectId/files/import/zip` (`services/api/src/app.ts:22577`),
déclenché à la fermeture d'un artefact. Sur les **11** appels à
`persistProjectFileManifest`, tous sont des chemins **en masse** : création (vide,
modèle, IA), imports (commit, GitHub ×2, zip), `files/import/zip`, restauration de
point de sauvegarde, duplication, restauration d'instantané.

**Le trou est la sauvegarde manuelle**, qui passe par
`FilesStore.saveFile` (`app/lib/stores/files.ts:881`) → `runtime.writeFile` →
`PUT /files/write`, et ne touche jamais au manifeste.

Conséquence directe pour le correctif : **brancher la persistance sur
`PUT /files/write` sans discriminer l'origine mettrait le manifeste sur le trajet
du flux de l'agent** — ~37 écritures de manifeste par fichier généré, chacune
étant une mutation du blob `ide-state` partagé sous contrôle de version
optimiste. C'est le danger, et il est évitable.

---

## 3. Les trois stratégies, chiffrées

Coût exprimé en **écritures de manifeste** pour deux scénarios :
**(G)** une génération de 20 fichiers, **(M)** une session d'édition manuelle de
30 minutes avec 40 sauvegardes.

### A. Discriminer par origine — persister hors flux seulement

Le manifeste est persisté sur `PUT /files/write` **sauf** quand l'écriture fait
partie d'une action de flux (un marqueur porté par la requête, l'appelant le
connaît déjà : `isStreaming`).

| | écritures de manifeste |
|---|---:|
| (G) génération | **0** — inchangé, l'agent garde `files/import/zip` |
| (M) édition manuelle | **40** — une par sauvegarde, rythme humain |

- **Coût** : nul sur le trajet chaud. Une mutation `ide-state` par `Ctrl+S`.
- **Risque** : le marqueur doit être fiable. Une écriture de flux mal étiquetée
  retombe dans l'amplification ; une écriture manuelle mal étiquetée reperd la
  donnée. **Testable** : c'est exactement ce que vérifie
  `project-manifest-durability.spec.ts`.
- **Fenêtre de perte** : quasi nulle — la persistance suit la sauvegarde.

### B. Regroupement par fenêtre de temps, côté serveur

Le manifeste est reconstruit au plus une fois par fenêtre (p. ex. 5 s) et par
projet, quelle que soit l'origine des écritures.

| | écritures de manifeste |
|---|---:|
| (G) génération de 15 min | **jusqu'à 180** (une par fenêtre de 5 s) |
| (M) édition manuelle de 30 min | **jusqu'à 360**, en pratique ~40 (fenêtres vides ignorées) |

- **Coût** : **pire que A sur le trajet chaud** — 180 mutations du blob partagé
  là où A en fait 0.
- **Risque** : contention sur `mutateProjectIdeState`, qui est déjà partagé avec
  les éditions collaboratives et les autorisations de terminal. Le commentaire de
  `persistProjectFileManifest` prévient explicitement du clobber.
- **Fenêtre de perte** : la durée de la fenêtre.
- **Avantage réel** : ne demande aucun marqueur d'origine, donc rien à mal
  étiqueter.

### C. Reconstruction de l'archive à la fermeture de session

Le manifeste est reconstruit depuis le pod quand l'espace de travail s'arrête.

| | écritures de manifeste |
|---|---:|
| (G) et (M) | **1** |

- **Coût** : le plus bas — une lecture en masse du pod, une écriture.
- **Risque** : **c'est le mode de panne qui a produit ce bug.** Un pod tué sans
  fermeture propre — OOM, éviction, recyclage d'inactivité, rollout — ne
  reconstruit rien, et **toute la session est perdue**. Le registre porte déjà
  `BUG-CREATE-003` : « un pod survit à l'arrêt de son enregistrement », preuve que
  les arrêts propres ne sont pas garantis.
- **Fenêtre de perte** : **toute la session**.

### Ce que je retiendrais

**A, avec B en filet.** A traite le trou réel (la sauvegarde manuelle) à coût nul
sur le trajet chaud ; B en dernier recours borne la perte si un marqueur d'origine
se révèle peu fiable en pratique. **C est à écarter** : elle optimise le cas
nominal en gardant intacte la panne qui a créé le défaut.

**Préalable à toute décision** : remesurer l'amplification de flux. Le chiffre de
750/20 date du 15/08 et deux correctifs de reprise ont été livrés depuis.

---

## 4. La preuve existe déjà, et elle est antérieure au correctif

`services/api/src/project-manifest-durability.spec.ts` fige les trois faits
mesurés — 11 persistances, toutes en masse ; aucune route d'écriture fichier par
fichier ne persiste ; le plan de reseed supprime ce que l'archive ignore — et
porte l'invariant visé en `it.fails`.

**Recette du correctif** : le jour où une route d'écriture persiste le manifeste,
`it.fails` passe au rouge et force à retirer les « DÉFAUT CONSTATÉ ».
Contre-vérifié : en simulant le correctif, le test tombe bien (`1 failed`).
