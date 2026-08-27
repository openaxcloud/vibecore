# Checklist démo investisseurs — état réel au 17/08/2026

Trois états par ligne, jamais fusionnés : **📤 dispatché**, **💻 codé** (commité +
poussé), **✅ testé live** (vérifié à l'écran + greps, sur les 3 formats).
Une ligne n'est « faite » que quand ✅ est coché.

- **Marketing public** : mesuré sur la **PROD** `https://e-code.ai`, sans compte.
- **Zones connectées** : mesurées sur l'**env de test**
  `https://app.34.163.208.161.sslip.io` (celui qui porte la clé LLM).
  ⚠️ Cet environnement sert l'image construite depuis `main` : il **ne contient
  pas** les correctifs de la PR #139, encore ouverte.
- Formats : **390** (mobile), **768** (tablette), **1440** (bureau).
- Langue : **français**, thème **sombre** — le thème est décidé serveur par le
  cookie `ecode_theme`, `colorScheme` de Playwright ne le pilote pas.

Captures : `/Users/hb/dev/vc-demo-preuves/` — **299 fichiers**.

---

## 1. Marketing public (PROD, sans compte)

| Zone | 📤 | 💻 | ✅ | Preuve |
|---|:-:|:-:|:-:|---|
| Accueil, /pricing, /plan-comparison, /enterprise, /solutions, /gallery, /templates | ☑ | ☑ | ☑ | `marketing-prod-fr/` — 200 partout, **zéro débordement de document** sur les 3 formats |
| /legal, /terms, /privacy, /security, /status | ☑ | ☑ | ☑ | `marketing-prod-fr2/` — 200 partout |
| /docs, /blog, /about, /contact, /careers | ☑ | ☑ | ☑ | `marketing-prod-fr2/` — 200 partout |
| Bascule EN/FR et détection automatique | ☑ | ☑ | ☑ | Contexte vierge `Accept-Language: fr-FR` → `lang=fr` + cookie `vibecore-auto-lang=fr` ; `en-US` → `lang=en` |

Deux défilements horizontaux subsistent, **volontaires** (conteneur en
`overflow-x: auto`, le document ne déborde pas) : le carrousel de suggestions de
l'accueil à 390 et la table comparative de `/pricing` à 768.

## 2. Authentification

| Zone | 📤 | 💻 | ✅ | Preuve |
|---|:-:|:-:|:-:|---|
| /login, /signup, /forgot-password | ☑ | ☑ | ☑ | `auth/` — 9 captures, 3 formats |

## 3. Tableau de bord et création de projet

| Zone | 📤 | 💻 | ✅ | Preuve |
|---|:-:|:-:|:-:|---|
| /dashboard, /projects, /templates, /gallery, /import, /deployments, /support (FR) | ☑ | ☑ | ☑ | `dashboard-fr/` — 21 rendus, 200 partout |
| Galerie, import GitHub / ZIP / projet vide | ☑ | ☑ | ☑ | `creation/` — 21 captures |
| **Cartes de projet vides** (BUG-USR-003) | ☑ | ☑ `c47f5cf1` | ☐ | Correctif dans la PR #139, **pas encore déployé** — voir §7 |

## 4. Parcours « créer un projet » (prompt → app → aperçu → déploiement)

| Étape | 📤 | 💻 | ✅ | Preuve |
|---|:-:|:-:|:-:|---|
| Génération depuis un prompt, 2 exécutions indépendantes | ☑ | ☑ | ☑ | `app-generee-{390,768,1440}.png`, `run2-{390,768,1440}.png` |
| Aperçu de l'app générée dans l'IDE | ☑ | ☑ | ☑ | `ide-apres-generation.png` |
| Déploiement, avant / après | ☑ | ☑ | ☑ | `deploiement-avant.png`, `deploiement-apres.png` |
| App déployée servie et montée (React, pas de page blanche) | ☑ | ☑ | ☑ | `app-deployee-{390,768,1440}.png` |

## 5. IDE (panneaux)

| Zone | 📤 | 💻 | ✅ | Preuve |
|---|:-:|:-:|:-:|---|
| Page projet + IDE, 3 formats | ☑ | ☑ | ☑ | `projet-fr/`, `projet/` — 33 captures |
| **Pastilles de la barre d'état coupées** (« Démarrage » réduit à 6 px) | ☑ | ☑ `a9f39694` | ☐ | Corrigé dans la PR #139, **pas encore déployé** |

## 6. Compte, facturation, organisation

| Zone | 📤 | 💻 | ✅ | Preuve |
|---|:-:|:-:|:-:|---|
| /account-settings (+ connected, data), /security-settings, /api-keys | ☑ | ☑ | ☑ | `compte-fr/` — 200 partout |
| /billing, /deployments, /organization-members, /organization-domains | ☑ | ☑ | ☑ | `compte-fr/billing-1440-dark.png` — page entièrement traduite |
| **/usage : tableau des quotas illisible à 390** | ☑ | ☑ `7a274450` | ☐ | Correctif dans la PR #139, **pas encore déployé** |
| **/notifications : interrupteurs hors champ à 390** | ☑ | ☑ `7a274450` | ☐ | Correctif dans la PR #139, **pas encore déployé** |

## 7. Défauts ouverts, par ordre d'impact sur la démo

1. **BUG-USR-003 — cartes de projet vides.** `GET /api/projects/<id>/thumbnail`
   répond **502 au bout de 32,5 s** ; le journal API montre « incoming request »
   et aucune ligne de fin. L'`<img>` ne charge pas **et** n'échoue pas, donc le
   repli « Aucun aperçu » ne s'affiche jamais. Corrigé (`c47f5cf1`) : borne de
   5 s côté API, bascule sur le repli à 6 s côté carte. **Non déployé.**
2. **BUG-PERF-001 — amplification d'écritures ×40** vers le pod runtime
   (1018 `PUT /files/write` pour 25 fichiers). Non corrigé, non bloquant pour la
   démo : invisible à l'écran.
3. **BUG-AGENT-005 — balisage de reprise persisté dans les fichiers.** Cause
   réelle identifiée côté serveur (capture paresseuse dans `app.ts`), corrigée
   (`cf5437aa`) avec 5 tests. **Non revalidé live** : cela demande une
   reconstruction de l'image `api` sur l'env de test partagé.
4. Slugs de projet sans translittération : « Créez un tableau de bord » donne
   `cr-ez-un-tableau-de-bord` dans la barre d'adresse. Corrigé dans la PR #139,
   **non déployé** — visible tel quel aujourd'hui sur l'env de test.

## 8. Ce qui n'est pas couvert, et pourquoi

- **Preuve visuelle connectée sur la PROD** : demande un cookie de session
  qu'Avi doit fournir. Aucun compte n'a été créé sur la prod.
- **Thème clair** : les campagnes ci-dessus sont en thème sombre. Le forçage du
  thème passe par le cookie `ecode_theme` ; une seconde passe complète en clair
  est faisable avec le même outil (`audit-zone.mjs`, paramètre `light`).
- **Revalidation live des correctifs de la PR #139** : impossible sans déployer,
  et l'env de test est partagé avec la session QA `local_e7c3cc0c`.
