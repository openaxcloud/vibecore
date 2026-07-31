# Certification réelle bouton-par-bouton — Vendor Risk Review (`vendor-risk-review`)

**Date :** 2026-07-26 · **Verdict : COMPLET** (après correction de 2 défauts d'affichage trouvés et corrigés pendant ce run)

Application full-stack Express 5 + sql.js + auth scrypt + cookie de session HMAC, pilotée par un
**vrai Chromium (Playwright 1.59.1)** contre le **vrai backend** (aucun mock, aucun stub réseau).

| | |
| --- | --- |
| Dossier de dev | `.rebuild/dev-vendor-risk-review/` |
| Serveur exercé | `pnpm dev` (Vite middleware) **puis** `pnpm start` (`NODE_ENV=production`, bundle `dist/`) sur `http://127.0.0.1:44110` |
| Driver | `certification/vendor-risk-review/run-cert.mjs` (46 contrôles), `run-cert-extra.mjs` (sondes complémentaires), `run-defect-repro.mjs` (repro des défauts avant correction) |
| Résultat driver | **46/46 OK** en mode dev (`results-dev.json`) **et** en mode production (`production-build/results-prod-final.json`) |
| Erreurs page (mode production) | **0** — `pageErrors: []` |
| Chevauchements de texte | **0** sur 13 balayages (desktop 1440 / tablette 820 / mobile 390, 5 vues) |
| Validation officielle | `[gallery] 1/1 passed` — install ✅ typecheck ✅ build ✅ HTTP 200 ✅ `pageErrors: []` — hash `e3def870…0e123d`, 23 fichiers |

---

## 1. Défauts trouvés et CORRIGÉS

### D1 — Chevauchement « NN% weight » / valeur dans le breakdown de score (confirmé)

Le défaut signalé est **confirmé et reproduit** : `.breakdown__value` était en
`position: absolute; right: 0; top: 0` dans un `.breakdown__row` en `position: relative`, alors que
`.breakdown__weight` occupe déjà le bord droit de la même ligne (`.breakdown__head` en
`justify-content: space-between`). Résultat mesuré : **chevauchement de 17 × 20 px sur les 4 lignes**,
rendu « 35% weig**80**t » à l'écran.

- Preuve avant : `certification/vendor-risk-review/00-BEFORE-breakdown-collision.png` + `results-before-fix.json`
  (recapturé en rejouant les sources pré-correction extraites de `git HEAD`).
- Correction : `src/ui.tsx` — la valeur est déplacée **dans** l'en-tête de ligne, à l'intérieur d'un
  conteneur `.breakdown__meta` partagé avec le libellé de pondération ;
  `src/styles.css` — `.breakdown__meta { display:inline-flex; gap:10px; flex-shrink:0 }`,
  `.breakdown__head { align-items:baseline; gap:12px }`, suppression du positionnement absolu de
  `.breakdown__value` (+ `tabular-nums`, `min-width:3ch`).
- Preuve après : `08-breakdown-zoom.png` — « Security posture · 35% weight · 80 » lisible, 0 px de recouvrement,
  vérifié aussi à 820 px et 390 px.

### D2 — Débordement horizontal de la page en mobile 390 px (trouvé pendant le run)

`.content` est un item de grille (`.layout`) : son `min-width:auto` laissait le tableau (`min-width:640px`,
largeur max-content ≈ 824 px) pousser **toute la page** de côté — **464 px de débordement document**,
barre latérale comprise, au lieu de faire défiler le tableau dans sa carte.

- Preuve avant : `00-BEFORE-mobile-390-overflow.png` (`scrollWidth 854 / clientWidth 390`).
- Correction : `src/styles.css` — `.content { min-width: 0 }`.
- Preuve après : débordement document **0 px** ; `.table-wrap` défile bien en interne
  (`scrollWidth 824 / clientWidth 360`, `scrollLeft` porté à 464 → colonnes Score / Status / Updated
  atteintes et lisibles) — `38-mobile-390-portfolio.png`, `41-mobile-390-table-scrolled.png`,
  `results-extra.json`.

**Après correction :** `pnpm typecheck` ✅, `pnpm build` ✅, parcours complet rejoué **intégralement** deux fois
(dev puis production) — 46/46 à chaque fois.

---

## 2. Tableau contrôle → résultat → preuve

Captures dans `certification/vendor-risk-review/` (run dev) et `certification/vendor-risk-review/production-build/`
(run production, mêmes noms de fichiers). Les notes ci-dessous proviennent du run **production** de référence
(`production-build/results-prod-final.json`).

| # | Contrôle exercé (clics/saisies réels) | Résultat | Preuve / mesure | Capture |
| --- | --- | --- | --- | --- |
| L1 | Écran de login : accroche + formulaire + 3 comptes démo | OK | 3 boutons de compte rendus | 01-login-screen.png |
| L2 | Identifiants démo affichés pour les 3 rôles | OK | 3 e-mails + 3 mots de passe visibles | 01-login-screen.png |
| L3 | Bouton « rôle » charge ses identifiants dans le formulaire | OK | champs → ciso@vendorrisk.demo / ciso-demo-2026 (les 3 boutons vérifiés, cf. `results-extra.json`) | 02-login-role-button-ciso.png |
| L4 | **Mauvais mot de passe** → erreur visible, pas de connexion | OK | bandeau « Those demo credentials did not match. », HTTP 401 | 03-login-wrong-password-error.png |
| L5 | Connexion analyst@vendorrisk.demo | OK | « Ada Okafor / Risk analyst » en barre latérale | 04-dashboard-analyst.png |
| D1 | Cartes de stats du portefeuille (suivis / en attente / high / approuvés) | OK | stats 10/2/4/5 cohérentes avec 10 lignes | 04-dashboard-analyst.png |
| D2 | 6 puces de filtre de statut | OK | Awaiting manager=1, Awaiting CISO=1, Approved=5, Rejected=2, Draft=1, All=10 — aucun statut mélangé | 05-dashboard-filter-all.png |
| U1 | Brouillon non scoré : « Submit » désactivé + explication | OK | « Score the vendor first to enable submission. » | 06-draft-unscored-submit-disabled.png |
| U2 | Brouillon non scoré : carte de score non vide | OK | « This vendor has not been scored yet. » | 06-draft-unscored-submit-disabled.png |
| X1 | **Breakdown : « NN% weight » vs valeur — pas de collision** | OK | 4 lignes nettes (35%/80, 20%/60, 30%/85, 15%/55), 0 px de recouvrement | 08-breakdown-zoom.png |
| U3 | Détail : lien mailto du contact + timeline peuplée | OK | `mailto:security@northwindpay.example`, 5 entrées de timeline | 07-vendor-detail-northwind.png |
| U4 | Lien « ← Back to portfolio » | OK | retour à « Vendor portfolio » | 09-back-to-portfolio.png |
| I1 | Intake : soumission bloquée si champs requis vides | OK | 3 champs requis invalides, formulaire non soumis | 10-intake-empty-validation.png |
| I2 | Intake : e-mail mal formé refusé | OK | `checkValidity()=false` sur « not-an-email » | 11-intake-invalid-email.png |
| I3 | Intake : liste déroulante Catégorie | OK | 6 catégories | 11-intake-invalid-email.png |
| C1 | Création d'un fournisseur (analyste) | OK | « Aurora Ledger … » créé en statut Draft, détail ouvert | 12-intake-created-medium.png |
| S1 | **Sliders → recalcul live du score pondéré** | OK | 60/40/50/40 → « Preview: 50 » = 0,35·60+0,2·40+0,3·50+0,15·40 | 13-scoring-live-preview-medium.png |
| S2 | **Sliders → recalcul live du tier** | OK | 50 → « Medium risk » | 13-scoring-live-preview-medium.png |
| S3 | Chaque slider reflète sa propre valeur 0-100 | OK | 60,40,50,40 | 13-scoring-live-preview-medium.png |
| S4 | « Save assessment » persiste score + tier côté serveur | OK | réponse serveur score 50 / « Medium risk » | 14-assessment-saved-medium.png |
| W1 | **Medium → manager** (soumission) | OK | badge « Awaiting manager » | 15-medium-submitted-awaiting-manager.png |
| A1 | Analyste : aucun bouton approve/reject sur un dossier en attente | OK | « This step is waiting on the approval manager. You are signed in as analyst. » | 16-analyst-cannot-approve.png |
| A2 | **Analyste POST /approve → refusé serveur** | OK | HTTP 403 « This step needs an approval manager. » | 16-analyst-cannot-approve.png |
| A6 | Re-scoring après soumission + score hors bornes | OK | HTTP 409 « …cannot be re-scored. » ; score=500 → 409 | 16-analyst-cannot-approve.png |
| W2 | **High → manager d'abord** | OK | score 76 (High), badge « Awaiting manager » | 17-high-submitted-awaiting-manager.png |
| W3 | **Low → auto-approuvé à la soumission** | OK | score 26 (Low), timeline « Low risk auto-approved on submission » | 18-low-auto-approved.png |
| L6 | Déconnexion : session effacée client + serveur | OK | `GET /api/session` → `user=null` | 19-signed-out.png |
| L7 | Connexion manager@vendorrisk.demo | OK | « Miguel Serrano / Approval manager » | 20-dashboard-manager.png |
| A3 | Manager ne peut pas ouvrir d'intake | OK | formulaire désactivé + « Only risk analysts can open a new intake. » | 21-manager-intake-disabled.png |
| W4 | **Manager approuve un Medium → Approved final** | OK | badge « Approved » après une seule signature | 22-medium-approved-by-manager.png |
| W5 | **Manager approuve un High → escalade CISO** | OK | badge « Awaiting CISO » | 23-high-routed-to-ciso.png |
| A4 | **Manager bloqué à l'étage CISO (UI + 403)** | OK | notice « This step is waiting on the CISO… » ; POST /approve → HTTP 403 « This step needs the CISO. » | 24-manager-blocked-at-ciso-stage.png |
| R1 | **Motif de rejet obligatoire** | OK | bouton désactivé si motif vide ; POST /reject avec motif blanc → HTTP 400 « A rejection needs a documented reason. » | 25-reject-button-disabled-empty-reason.png |
| R2 | **Rejet avec motif** | OK | statut « Rejected » + motif verbatim dans la timeline et le CSV | 26-rejected-with-reason.png |
| L8 | Connexion ciso@vendorrisk.demo | OK | « Nadia Bloom / CISO » | 27-dashboard-ciso.png |
| W6 | **CISO approuve le High escaladé → Approved final** | OK | timeline : manager → « routed to CISO » → « CISO Nadia Bloom approved onboarding » | 28-high-approved-by-ciso.png |
| AU1 | Journal d'audit complet | OK | 52 événements listés | 29-audit-trail.png |
| AU2 | Recherche dans le journal | OK | recherche fournisseur → 5 événements, tous du bon fournisseur | 30-audit-search-filter.png |
| AU3 | Recherche sans résultat → état vide (pas d'écran blanc) | OK | « No matching events » | 31-audit-search-empty-state.png |
| AU4 | **Export CSV — contenu réel vérifié** | OK | 52 lignes de données, en-tête `id,created_at,vendor,actor,action,detail`, contient les 4 fournisseurs créés et le motif de rejet ; fichier conservé (`audit-export.csv`) | 32-audit-after-export.png |
| P1 | **Persistance après rechargement complet** | OK | Tessera=rejected/Medium/47, Helios=approved/High/76, Quill=approved/Low/26, Aurora=approved/Medium/50 | 33-persistence-after-reload.png |
| A5 | API non authentifiée refusée | OK | `/api/vendors`, `/api/audit`, `/api/audit/export`, `POST /api/vendors` → 401 | — |
| L9 | Déconnexion finale → écran de login | OK | formulaire de connexion réaffiché | 34-final-signed-out.png |
| V1 | Tablette 820 px : portefeuille + détail + audit | OK | débordement 0/0 px, 0 paire de textes en chevauchement | 36-tablet-820-vendor-detail.png |
| V2 | **Mobile 390 px : aucun débordement horizontal** | OK | débordement 0/0 px, tableau défilant dans sa carte | 38-mobile-390-portfolio.png |
| V3 | Mobile 390 px : navigation atteignable, 0 chevauchement | OK | Portfolio / New intake / Audit trail cliquables | 40-mobile-390-audit.png |

### Sondes complémentaires (`run-cert-extra.mjs` → `results-extra.json`)

| Contrôle | Résultat | Preuve |
| --- | --- | --- |
| Les **3** boutons de compte démo chargent chacun leurs identifiants | OK | analyst/manager/ciso + mots de passe respectifs |
| Colonnes cachées du tableau atteignables en mobile | OK | `scrollLeft` 0 → 464, en-têtes Score / Status / Updated visibles, débordement document 0 (`41-mobile-390-table-scrolled.png`) |
| Ligne de tableau ouvrable au clavier (Entrée) | OK | focus 1re ligne + Entrée → détail du même fournisseur (`42-keyboard-row-open.png`) |

### Persistance côté serveur (redémarrage de processus, hors navigateur)

| Contrôle | Résultat | Preuve |
| --- | --- | --- |
| Données survivent au **redémarrage du serveur** | OK | avant : 10 fournisseurs ; après `kill` + `pnpm start` : **10 fournisseurs identiques** (statuts/tiers/scores) + **36 événements d'audit** relus depuis `data/app.db` |
| Cookie de session invalidé au redémarrage | OK (par conception) | ancien cookie → HTTP 401 ; le secret HMAC est re-tiré à chaque boot (`server/auth.ts`), documenté dans le README |

---

## 3. Confirmations explicites demandées

- **Aucune vue vide** — les 5 vues (Login, Portfolio, Intake, Détail, Audit) rendent du contenu ; les cas
  « zéro donnée » affichent un état vide explicite (`No matching events`, `Nothing here yet`), jamais un écran blanc.
- **Aucun bouton inerte** — chaque contrôle a été cliqué : 3 boutons de compte démo, Sign in, Sign out (×3 rôles),
  3 entrées de navigation, 6 puces de filtre, lignes du tableau (souris **et** clavier), « ← Back to portfolio »,
  4 sliders, « Save assessment », « Submit for approval », « Approve », « Reject with reason », zone de motif,
  champ de recherche d'audit, lien « Export CSV », sélecteur de catégorie et les 4 champs d'intake.
  Les seuls contrôles désactivés le sont **volontairement et avec explication à l'écran** (Submit sans score,
  Reject sans motif, intake pour un non-analyste).
- **Aucun texte qui se chevauche** — détecteur générique (toutes les feuilles de texte visibles, intersection
  deux à deux) : **0 collision sur 13 balayages** couvrant login, portefeuille, intake, détail (non scoré, scoré,
  approuvé), audit, en 1440 / 820 / 390 px. Le défaut D1 a été détecté par ce même détecteur avant correction.
- **Aucune donnée factice présentée comme réelle** — le jeu de départ est un **jeu de démonstration assumé** :
  écran d'accueil « Demo accounts » avec les 3 identifiants affichés, contacts fournisseurs en domaines réservés
  `*.example`, données seedées côté serveur au premier boot (`shared/seed.ts`) et réellement stockées en base.
  Aucun chiffre n'est inventé côté client : score, tier, statuts, timeline et CSV proviennent tous du backend
  (vérifié en comparant l'affichage aux réponses `/api/*`). Le mode dégradé « read-only » (backend injoignable)
  affiche un bandeau explicite et désactive toute écriture — il n'a pas été déclenché ici, le backend étant réel.
- **Persistance vérifiée** — deux niveaux : rechargement complet de page (P1) et **redémarrage du processus serveur**
  (relecture de `data/app.db`).
- **Erreurs JavaScript** — **0 `pageerror` applicatif**. En mode **production** (bundle `dist/`) : `pageErrors: []`,
  y compris dans le rapport de validation officiel. En mode **dev**, 4 `pageerror`
  « WebSocket closed without opened. » ont été observés : ils viennent **exclusivement de `@vite/client`**
  (HMR, port 24678 déjà occupé par un autre serveur de dev de la machine) et **non du code applicatif** —
  ils disparaissent en production. Les seules `console.error` restantes sont le log natif du navigateur pour les
  réponses HTTP **volontairement négatives** des tests (401 mauvais mot de passe, 403 rôle interdit, 409 re-scoring,
  400 motif vide).

---

## 4. Régénération du module et re-validation officielle

1. `node .rebuild/generate-vendor-risk-review-module.mjs` → 23 fichiers réécrits dans
   `packages/template-catalog/src/apps/vendor-risk-review.ts` (exclus : `node_modules`, `dist`, `data/*.db`,
   lockfiles ; le dossier `certification/` n'est pas dans l'arborescence de l'app).
2. `node_modules/.bin/prettier --write packages/template-catalog/src/apps/vendor-risk-review.ts`.
3. Diff du module limité à **`src/styles.css` + `src/ui.tsx`** — exactement les deux fichiers corrigés.
   Régénération re-jouée après restauration des sources : fichier **identique** (idempotent).
4. Validation officielle **sans `--skip-install`** :

```
GALLERY_EVIDENCE_DIR=…/runtime node_modules/.bin/tsx scripts/validate-gallery-demo-apps.ts \
  --app=vendor-risk-review --port=43110
[gallery] vendor-risk-review (1/1)
[gallery] 1/1 passed
```

Rapport : `docs/deploy-evidence/2026-07-17-gallery-apps/runtime/gallery-demo-app-validation-vendor-risk-review.json`
— `install: passed`, `typecheck: passed`, `build: passed`, `httpStatus: 200`, `pageErrors: []`,
`contentHash: e3def87057ea437cedce51c3b0a66226de2f64530481a76817926020a00e123d`, 23 fichiers.

---

## 5. VERDICT

**COMPLET.** Tous les contrôles de l'application ont été exercés en réel contre le backend réel :
46/46 en mode dev **et** 46/46 sur le bundle de production, plus les sondes complémentaires et la preuve de
persistance au redémarrage. Les **deux défauts d'affichage** trouvés (chevauchement du breakdown de score,
débordement horizontal en mobile) sont **corrigés, re-testés de bout en bout, régénérés dans le module du dépôt
et re-validés** par le validateur officiel (`1/1 passed`, 0 erreur de page).

Réserve d'honnêteté, sans impact fonctionnel : en 390 px, les colonnes Risk / Score / Status / Updated du
portefeuille ne sont visibles qu'après défilement horizontal **du tableau dans sa carte** (motif responsive
standard, vérifié atteignable — capture 41). Une refonte en cartes empilées serait un choix de design, pas
une correction de défaut.
