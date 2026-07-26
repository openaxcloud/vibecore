# Certification réelle — Warehouse Layout Planner (`warehouse-layout-planner`)

**Date** : 2026-07-26 · **Verdict** : ✅ **COMPLET** (31/31 contrôles OK sur le chemin WebGL, 31/31 sur le repli 2D)

Application de galerie client-only (Vite + React 19 + TypeScript + Three.js 0.185), sans backend.
Certification menée **contrôle par contrôle**, par interactions réelles (pointeur / molette Playwright)
dans un vrai Chromium 147.0.7727.15, sur les **deux chemins de rendu**.

---

## 0. Périmètre certifié = ce qui est livré

Avant tout test, le répertoire de développement a été comparé fichier par fichier au module publié
`packages/template-catalog/src/apps/warehouse-layout-planner.ts` (extraction du tableau
`warehouseLayoutPlannerFiles` puis `diff`) :

| | |
|---|---|
| Fichiers du module | 14 |
| Fichiers identiques au dev-dir | **14 / 14** (avant correctifs **et** après régénération) |
| Fichiers exclus du module (harnais, PNG, lockfile, `dist/`, `node_modules/`, `.tsbuildinfo`) | vérifiés absents |

La certification porte donc bien sur le code livré, pas sur une variante locale.

---

## 1. Chemin de rendu réellement emprunté

| Environnement | Chemin constaté | Preuve |
|---|---|---|
| Chromium `--enable-unsafe-swiftshader` (WebGL logiciel) | **WebGL / Three.js** — badge « 3D model », 1 `<canvas>`, aucune note de repli | `webgl-01-initial.png`, `results-webgl.json` |
| Chromium `--disable-webgl --disable-3d-apis` | **Repli 2D honnête** — badge « 2D floor plan » + note « 3D unavailable in this environment… » | `2d-01-initial.png`, `results-2d.json` |

Le repli n'est pas un écran vide : c'est un plan en vue de dessus complet, avec la **même** math de
racking et **les mêmes** interactions de glissement.

---

## 2. Tableau contrôle → résultat → preuve

Colonne « WebGL » = run avec WebGL logiciel ; colonne « 2D » = run avec WebGL désactivé de force.

| # | Contrôle | WebGL | 2D | Preuve (chiffres réellement lus à l'écran) |
|---|---|---|---|---|
| C01 | Scène visible et non vide | ✅ OK | ✅ OK | 179 couleurs distinctes / 212 121 px de palettes (WebGL) ; 224 / 115 085 (2D). `*-01-initial.png` |
| C02 | Capacité au démarrage (géométrie réelle en mètres) | ✅ OK | ✅ OK | Panneau 864 palettes / 6 runs / 18 % / rec 6 / 3,20 m — conforme au recalcul indépendant depuis la géométrie (6 runs × 3 niveaux × 12 travées × 2 faces × 2 palettes). `*-01-initial.png` |
| C03 | Orbite caméra (drag sur le fond) | ✅ OK | n/a | Hash du stage `14c92f2a…` → `5c644657…`, scène toujours peuplée. `webgl-02-after-orbit.png` |
| C04 | Zoom molette (avant / arrière) | ✅ OK | n/a | 3 vues distinctes : orbite `5c644657…` → zoom-in `c6e17629…` → zoom-out `a61f1224…`. `webgl-03/04-after-zoom-*.png` |
| C05 | Orbite/zoom ne modifient pas la capacité | ✅ OK | n/a | 864 palettes / 3,20 m / rec 6 inchangés. `webgl-04-after-zoom-out.png` |
| C06 | Sélection d'une rangée (press) — surbrillance | ✅ OK | ✅ OK | Le rendu change au `pointerdown` (teinte de sélection). `*-05-row-selected.png` |
| C07 | Clic simple = sélection pure (ni déplacement ni faux toast) | ✅ OK **(corrigé)** | ✅ OK | Après relâchement : `toast=null`, 864 palettes, 3,20 m, rec 6, badge « stable ». **Cassé avant correctif** (voir §3, défaut A). `*-05-row-selected.png` |
| C08 | Panneau « live » pendant le glissement | ✅ OK | ✅ OK | Badge = `live` pendant le drag. `*-06-legal-drag-inflight.png` |
| C09 | Déplacement légal → capacité recalculée (**chiffres vérifiés**) | ✅ OK | ✅ OK | Rangée 13,5 m → 20,0 m : rec **6 → 4** (attendu 4), 3,20 m (attendu 3,20 m), 864 palettes, « Workable », aucun toast. `*-07-legal-drag-dropped.png` |
| C10 | Fin de glissement → retour « stable » | ✅ OK **(corrigé)** | ✅ OK **(corrigé)** | Badge `stable` après dépose. **Restait bloqué sur `live` avant correctif** (défaut B). |
| C11 | Violation de clearance en vol → rangée rouge + « Blocked » | ✅ OK | ✅ OK | 61 815 px rouges (WebGL) / 38 573 (2D), `Layout=Blocked`, bandeau `clearance bad`, allée affichée −1,08 m (WebGL) / −0,70 m (2D). `*-08-illegal-drag-inflight.png` |
| C12 | Dépose illégale **refusée + snap-back + toast** | ✅ OK | ✅ OK | Toast « Aisle below 2.8 m fork-truck clearance — row returned to its last valid spot. » ; retour exact à 3,20 m / rec 6 / « Workable » ; rendu revenu (`59756621…` → `97a8e415…`). `*-09-illegal-drag-refused-toast.png` |
| C13 | Presets encore vivants **après** un glissement (non-régression) | ✅ OK **(corrigé)** | ✅ OK **(corrigé)** | « Narrow aisle » après drag → 2,80 m, badge `stable`. **Panneau totalement figé avant correctif** (défaut B). |
| C14 | Preset « Narrow aisle » (2,8 m) | ✅ OK | ✅ OK | 2,80 m / Workable / 6 runs / rec 6 / 864 palettes. `*-10-preset-narrow.png` |
| C15 | Preset « Wide aisle » (4,6 m) — recalcul complet | ✅ OK | ✅ OK | 4,60 m ; rec **6 → 4** (attendu 4) : basculer narrow↔wide change bien la marge exploitable. `*-11-preset-wide.png` |
| C16 | Bouton « Add row » | ✅ OK | ✅ OK | 6 → 7 runs, **864 → 1 008 palettes**, delta affiché « +144 vs start ». `*-12-add-row.png` |
| C17 | Garde « plus de place au sol » sur Add row | ✅ OK | ✅ OK | Saturation à 9 runs → toast « No floor width left for another rack run — narrow an aisle first. ». `*-13-add-row-floor-full.png` |
| C18 | Bouton « Reset » | ✅ OK | ✅ OK | Retour à 864 / 6 runs / 3,20 m / rec 6 / « same as start ». `*-14-reset.png` |
| C19 | Bouton « Controls » (carte d'aide) | ✅ OK | ✅ OK | fermé → ouvert → fermé, libellé bascule « Controls » / « Hide help », texte mentionne bien 2,8 m. `*-15-help-open.png` |
| C20 | Étiquette du chemin de rendu (`mode-tag`) | ✅ OK | ✅ OK | « 3D model » / « 2D floor plan » selon le chemin réellement pris. |
| C21 | Cohérence après reload | ✅ OK | ✅ OK | 864 / 6 runs / 3,20 m / rec 6, même mode, scène peuplée, badge `stable`. **L'app ne persiste pas volontairement** : le reload restitue à l'identique la disposition de départ documentée. `*-16-after-reload.png` |
| C22 | Responsive desktop 1440 px | ✅ OK | ✅ OK | `scrollWidth 1440 ≤ clientWidth 1440` ; panneau latéral permanent, pilule tiroir et bouton Close masqués. `*-17-responsive-desktop.png` |
| C23 | Responsive tablette 768 px | ✅ OK | ✅ OK | `scrollWidth 768 ≤ 768` ; le tiroir bas apparaît (« Show capacity » visible). `*-18-responsive-tablet.png` |
| C24 | Responsive mobile 375 px — **pas de scroll horizontal** | ✅ OK | ✅ OK | `scrollWidth 375` / `body 375` ≤ `clientWidth 375`. `*-19-responsive-mobile.png` |
| C25 | Tiroir Capacity mobile (**ouverture ET fermeture réelles**) | ✅ OK **(corrigé)** | ✅ OK **(corrigé)** | Ouvert : sheet top 211 px, bouton « Close » **topmost au hit-test**, cible 72×44 px. Refermé : sheet top 824 px (hors écran), pilule de nouveau visible. **Le tiroir était impossible à refermer avant correctif** (défaut C). `*-20-mobile-drawer-open.png`, `*-20b-mobile-drawer-closed.png` |
| C26 | Contrôles utilisables dans le tiroir mobile | ✅ OK | ✅ OK | « Wide aisle » depuis le tiroir → 4,60 m. `*-21-mobile-preset-in-drawer.png` |
| C27 | Glissement d'une rangée en mobile (375 px) | ✅ OK | ✅ OK | rec 6 → 4 après drag 13,5 → 20 m. `*-22-mobile-after-drag.png` |
| C28 | **Aucun texte qui se chevauche** | ✅ OK | ✅ OK | 26 nœuds de texte testés par intersection de rectangles → 0 collision. `*-17-responsive-desktop.png` |
| C29 | **Aucun contrôle inerte** | ✅ OK | ✅ OK | 5 boutons visibles, tous non désactivés, `pointer-events` actif, et **topmost au `elementFromPoint` de leur propre centre** : Controls · Narrow aisle · Wide aisle · Add row · Reset. |
| C30 | **Zéro `pageerror` · zéro `console.error`** | ✅ OK | ✅ OK **(corrigé)** | `pageerror = 0`, `console.error` applicatif = 0, bruit `@vite/client`/HMR = 0, log three.js « WebGLRenderer » = **0**. Voir §3, défaut D. |
| C31 | Mobile — le toast ne recouvre pas la pilule « Show capacity » | ✅ OK **(corrigé)** | ✅ OK **(corrigé)** | toast top 644 px, pilule top 752 px, recouvrement **0 px**. `*-23-mobile-toast-vs-pill.png` |

Résultats machine complets : `results-webgl.json` et `results-2d.json` (31 entrées chacun, avec les
valeurs lues, les hashes de rendu et le journal de diagnostics).

---

## 3. Défauts trouvés et corrigés

Le run initial (avant correctifs) a mis en évidence **quatre défauts réels**, tous reproduits par
interaction avant d'être corrigés, puis re-testés.

### Défaut A — clic sur une rangée = téléportation fantôme (chemin 3D)
`scene3d.ts::onPointerDown` n'initialisait pas `dragCurrentX`. Un `pointerdown` + `pointerup` sans
mouvement (= le geste « je sélectionne une rangée ») committait donc la rangée à la **dernière valeur
de glissement connue** — 0 m au premier clic. Sur la disposition de départ, cela viole toujours la
clearance : chaque simple clic produisait un **faux toast d'erreur** et un snap-back.
Mesuré avant correctif : clic sur la rangée à −13,5 m → `toast="Aisle below 2.8 m…"`, badge passé à `live`.
`scene2d.ts` faisait déjà la bonne chose (ligne `dragCurrentX = dragStartRowX`) — seul le chemin 3D
était touché.
**Correctif** : `dragCurrentX = row.x` au `pointerdown` + remontée de la déclaration `let dragCurrentX`
avec les autres variables d'état du drag.

### Défaut B — panneau Capacity définitivement figé après le premier glissement (les deux chemins)
Les deux renderers rappelaient `callbacks.onPreview(rows, …)` **après** `onCommit`. Or `App.onCommit`
vient justement de faire `setPreview(null)` : ce rappel rouvrait un preview qui n'était plus jamais
refermé. Conséquences mesurées avant correctif, sur un glissement **accepté** (13,5 → 20 m) :

| Action après le drag | Panneau | Scène 3D |
|---|---|---|
| état attendu | rec 4, badge `stable` | rec 4 |
| **constaté** | rec 4 mais badge bloqué sur `live` | — |
| « Add row » | **864 palettes / 6 runs — aucun changement** | la rangée est bien ajoutée (px de palettes 212 121 → 267 209) |
| « Reset » | **aucun changement** | scène remise à zéro |
| « Narrow aisle » | **aucun changement** | scène recalculée |

Autrement dit, après le premier glissement, tous les boutons paraissaient morts alors que le modèle
3D, lui, réagissait — le pire cas : l'utilisateur voit des chiffres faux.
**Correctif** : suppression de l'appel `onPreview` post-commit dans `scene3d.ts` et `scene2d.ts`
(l'état committé est déjà la source de vérité côté React), avec un commentaire expliquant pourquoi il
ne faut pas le réintroduire. Non-régression verrouillée par le contrôle **C13**.

### Défaut C — tiroir Capacity mobile impossible à refermer
`.drawer-toggle` (z-index 12, coin bas droit) est intégralement recouvert par `.panel.open`
(z-index 15, `bottom: 0`, hauteur 601 px sur un écran de 812 px). Mesure au `elementFromPoint` du
centre du bouton : l'élément retourné était `STRONG.good "Workable"` du panneau, pas le bouton →
**bouton inerte, aucun autre moyen de refermer la feuille**. Playwright échouait d'ailleurs sur le
clic (« subtree intercepts pointer events »).
**Correctif** : la pilule flottante ne sert plus qu'à *ouvrir* (elle est démontée quand la feuille est
ouverte) et un bouton **« Close »** a été ajouté dans l'en-tête du panneau, visible uniquement en
mode feuille (≤ 820 px), cible **72 × 44 px**. Cibles tactiles portées à `min-height: 44px` sur les
deux contrôles. Vérifié par hit-test réel (C25) et par ouverture/fermeture effectives.

### Défaut D — bruit console de three.js avant le repli 2D
Quand WebGL est indisponible, `new WebGLRenderer()` loggue **3 `console.error`** (« A WebGL context
could not be created… ») avant que l'app puisse intercepter le throw — 72 erreurs console sur le run
2D complet (24 chargements). Aucun `pageerror`, et le repli fonctionnait, mais la console n'était pas
propre.
**Correctif** : sonde préalable dans `view.ts` (`canvas.getContext('webgl2') ?? getContext('webgl')`,
contexte relâché aussitôt via `WEBGL_lose_context`) ; three.js n'est sollicité que si un contexte peut
exister, et le `catch` nettoie en plus un éventuel canvas à moitié construit. Résultat re-mesuré :
**0 `console.error`** sur le run 2D, `pageerror = 0`, repli toujours annoncé honnêtement à l'écran.

### Fichiers touchés
`src/scene3d.ts`, `src/scene2d.ts`, `src/view.ts`, `src/App.tsx`, `src/styles.css` (5 des 14 fichiers).

---

## 4. Confirmations explicites demandées

| Exigence | Statut | Sur quoi elle repose |
|---|---|---|
| Scène visible et non vide | ✅ | Analyse pixel réelle des captures (179 / 224 couleurs distinctes, > 115 000 px de racking), pas une simple présence de `<canvas>`. |
| Aucun contrôle inerte | ✅ | C29 (hit-test `elementFromPoint` sur chaque bouton visible) + C25 (le seul contrôle réellement inerte trouvé — le toggle du tiroir mobile — a été corrigé). |
| Aucun texte qui se chevauche | ✅ | C28, intersection de rectangles sur 26 nœuds de texte ; C31 pour le cas dynamique toast × pilule mobile. |
| Calculs de capacité réels (vraie géométrie en mètres) | ✅ | Toutes les valeurs du panneau confrontées à une **ré-implémentation indépendante** de la math de racking dans le harnais (C02, C09, C11, C14–C18). Aucun écart. |
| Cohérence après reload | ✅ | C21 sur les deux chemins. À noter honnêtement : **l'app ne persiste pas d'état** ; le reload restitue la disposition de départ, de façon déterministe et identique. |
| Responsive web / tablette / mobile | ✅ | C22 / C23 / C24 (+ C25–C27, C31 pour le comportement mobile), aucun débordement horizontal aux 3 formats. |
| Zéro pageerror applicatif | ✅ | 0 sur les deux chemins, avant comme après correctifs. Bruit `@vite/client`/HMR : 0 également. Le log three.js (voir défaut D) a été éliminé plutôt qu'excusé. |

---

## 5. Limites connues (déclarées, non corrigées)

Pour ne rien sur-revendiquer :

1. **Pas de pincement pour zoomer sur tactile.** Le zoom est câblé sur l'événement `wheel` uniquement.
   Sur un vrai écran tactile, l'orbite et le glissement de rangée fonctionnent (pointer events), mais
   il n'y a pas de geste de zoom. Non testé comme « OK » : ce contrôle n'existe pas.
2. **Cadrage mobile portrait serré.** À 375 px, la caméra par défaut cadre le racking bord à bord et le
   pourtour du sol sort du champ (`webgl-19-responsive-mobile.png`). C'est lisible et jouable, mais la
   caméra ne s'auto-ajuste pas au ratio.
3. **Aucune persistance** (cf. C21) — choix assumé, mais à ne pas confondre avec « l'état survit au reload ».

---

## 6. Régénération du module et re-validation officielle

1. Module régénéré depuis le dev-dir corrigé par script Node (exclusions : `node_modules/`, `dist/`,
   lockfiles, `.tsbuildinfo`, PNG, scripts de harnais `*.mjs`, dossier `certification/` ; le script
   **échoue** si l'ensemble des fichiers trouvés diffère des 14 chemins canoniques attendus), au format
   `export const warehouseLayoutPlannerFiles: readonly GalleryDemoAppFile[] = Object.freeze([...])`
   avec contenus `JSON.stringify`.
2. `prettier --write` sur `packages/template-catalog/src/apps/warehouse-layout-planner.ts`.
3. Re-diff dev-dir ↔ module : **14 / 14 identiques**. Diff git du module : **5 lignes modifiées**, soit
   exactement les 5 fichiers source corrigés.
4. Validation officielle relancée **sans `--skip-install`** :

```
node_modules/.bin/tsx scripts/validate-gallery-demo-apps.ts \
  --app=warehouse-layout-planner --port=43160
→ [gallery] 1/1 passed
```

| Champ | Valeur |
|---|---|
| `contentHash` | `d385f9b0abc890bb5e78ecd3bc5c6f96ccd09c6aef8d2dbacbcc824da1723cec` (avant : `78035cb7…`) |
| `fileCount` | 14 |
| `install` / `typecheck` / `build` | passed / passed / passed |
| `httpStatus` | 200 |
| `pageErrors` | `[]` |
| build | `✓ built in 558ms` — `index.css 6.94 kB`, `index.js 733.89 kB` (gzip 197.42 kB) |

`tsc --noEmit` du dev-dir : 0 erreur.

---

## 7. Méthode (reproductible)

- Serveur : `node_modules/.bin/vite --host 127.0.0.1 --port 44160 --strictPort` lancé directement
  (le piège `pnpm dev -- --port X` insère un `--` que Vite ignore).
- Pilotage : Playwright (`@playwright/test` du worktree), Chromium 147.0.7727.15,
  `--enable-unsafe-swiftshader --use-gl=swiftshader` pour le run WebGL,
  `--disable-webgl --disable-3d-apis` pour le run de repli.
- Les coordonnées de clic ne sont pas devinées : le harnais **réplique exactement** la caméra de
  `scene3d.ts` (PerspectiveCamera 45°, sphérique r=58 / θ=0,28π / φ=0,32π, cible (0, 3, 0)) et le
  mapping haut-de-page de `scene2d.ts`, ce qui donne le pixel écran d'une position en mètres — et donc
  des glissements dont la distance en mètres est connue, d'où la vérification des chiffres attendus.
  La rangée la plus à droite est visée en 3D car c'est la plus proche de la caméra : elle ne peut pas
  être masquée par une autre.
- Harnais : `.rebuild/dev-warehouse-layout-planner/cert2-helpers.mjs`, `cert2-run.mjs`
  (`node cert2-run.mjs` / `node cert2-run.mjs --no-webgl`), scripts de reproduction des défauts
  `cert2-probe.mjs`, `cert2-probe2.mjs`, `cert2-drawer.mjs`.

---

## VERDICT : ✅ COMPLET

31/31 contrôles OK sur le chemin **WebGL**, 31/31 sur le **repli 2D**, après correction de quatre
défauts réels (deux d'entre eux — le panneau figé et le tiroir mobile non refermable — rendaient des
contrôles visiblement morts pour l'utilisateur). Zéro `pageerror`, zéro `console.error` sur les deux
chemins. Module publié régénéré, re-diffé à l'identique du code testé, et re-validé par le validateur
officiel sans `--skip-install`. Limites déclarées au §5.
