# DESIGN CAPTURES

Captures et mesures prises **sur la production** (`app.e-code.ai`), pas sur un montage.
Chaque entrée dit ce qui a été mesuré, avec quoi, et ce que la mesure ne prouve PAS.

---

## Zone de saisie du panneau Agent — état au 2026-08-31

**Méthode.** Compte QA jetable créé via `POST https://api.e-code.ai/auth/register`, projet
vide, cookie `vc_session` posé dans un contexte Playwright, `app.e-code.ai/projects/<id>/ide`
en réel. Trois formats × deux thèmes. Compte et organisation **supprimés après coup**, avec
vérification (`reste_user=0 reste_org=0`).

**Mesuré : `.bolt-project-chatbox` AU REPOS, sur un projet vide, sans message.**

| Format | Hauteur du composer | Part de l'écran | Capture |
|---|---:|---:|---|
| mobile 390×844 | **225 px** | 27 % | [sombre](docs/design/captures/composer-prod-mobile-390-sombre.png) · [clair](docs/design/captures/composer-prod-mobile-390-clair.png) |
| tablette 768×1024 | **174 px** | 17 % | [sombre](docs/design/captures/composer-prod-tablette-768-sombre.png) · [clair](docs/design/captures/composer-prod-tablette-768-clair.png) |
| bureau 1440×900 | **247 px** | 27 % | [sombre](docs/design/captures/composer-prod-bureau-1440-sombre.png) · [clair](docs/design/captures/composer-prod-bureau-1440-clair.png) |

**Décomposition des 225 px en mobile** (mesurée nœud par nœud) :

| Bloc | Hauteur | Ce que c'est |
|---|---:|---|
| bande de sélecteurs | **109 px** | `Lite / Economy / Power` + `Advanced` + `~$0.33` (50 px), puis le bouton `Plan` (44 px) — les deux **passent à la ligne** à 390 px |
| coque de saisie | **95 px** | le champ lui-même 48 px, la rangée de commandes 45 px |
| marges | ~21 px | |

Autrement dit : **48 % du composer est occupé par des contrôles empilés AU-DESSUS du champ**,
et le champ de frappe ne fait que 48 px. C'est le défaut signalé par Avi.

Sur bureau 1440 le même empilement donne 101 px de sélecteurs pour 122 px de coque.

### Ce que ces chiffres ne disent PAS

La PR #278 (`feat/agent-composer-compact`) déplace ces sélecteurs **dans** la rangée de
commandes, sous le champ. **Elle n'est pas déployée** : les 225 px ci-dessus sont donc l'état
AVANT, mesuré sur `main`.

Deux tentatives de préfigurer l'APRÈS, toutes deux insuffisantes, dites comme telles :

1. **Injection du seul CSS de la branche** (`flex-wrap: nowrap` sur la bande) : 225 → 174 px
   en mobile. Mais la capture montre que le bouton `Plan` sort du champ visible, poussé dans un
   défilement horizontal sans affordance. **Régression fonctionnelle — écartée.**
2. **Simulation de la structure de la branche** (déplacement des nœuds dans la rangée de
   commandes + CSS de la branche) : 174 → 115 px en tablette (**−34 %**), mais seulement
   225 → 216 px en mobile (**−4 %**) et 247 → 242 px sur bureau (**−2 %**), parce que la rangée
   de commandes se remet alors à passer à la ligne sur trois niveaux. Ce DOM reconstruit à la
   main **n'est pas** celui de la branche : la mesure est une approximation, pas une preuve.

**Conclusion honnête : le gain de #278 est prouvé en tablette et NON prouvé en mobile ni sur
bureau.** Il faut la déployer puis reprendre cette mesure à l'identique avant de dire que le
défaut signalé par Avi est corrigé.

### Ce qui est prouvé par ailleurs

Le montage E2E `ui-details` **épingle la boîte de saisie à `min-height: 112px`** : il valide la
contrainte de mise en page (le composer reste au-dessus de la barre de navigation, la réserve
de défilement couvre le chrome permanent) mais il **ne peut pas** montrer le composer rétrécir.
Ne pas lui faire dire ça.

Ce que ce montage prouve, lui, après le correctif de la réserve :

| Format | Réserve avant | Réserve après |
|---|---:|---:|
| mobile 390 | 303,84 px | **219,44 px** |
| tablette 768 | 360 px | **240 px** |
| 320×568 et 568×320 | 236 px | **184 px** (plancher = barre 72 + boîte 112, mesurés) |

---

## Contraste de l'IDE et des pages publiques — balayage du 2026-08-31

**Méthode.** Balayage par **pixels rendus**, pas par arbre DOM : ce dépôt peint des
surfaces avec des calques FRÈRES en position absolue, donc remonter les ancêtres ment.
L'outil neutralise le texte, prend une capture, échantillonne le fond réel derrière
chaque boîte, puis rétablit le texte. Session QA jetable pour les routes authentifiées,
supprimée après coup (`reste_user=0 reste_org=0`).

### Faux négatif à connaître

`waitUntil: 'networkidle'` **ne se produit jamais** dans l'IDE (websocket du terminal,
sondes de statut, HMR). Le balayage rendait alors **« 0 défaut »** sur une page qui
n'avait jamais chargé — et le rapport ne le disait qu'en regardant le champ `error` de
chaque entrée. Toujours vérifier qu'une mesure a mesuré quelque chose avant de la lire.
Sur `?panel=git` en thème sombre, il faut ~20 s : à 12 s le bouton « Commit changes »
n'est pas encore rendu.

### Marketing et authentification

| Route | asymétrique | dans les 2 thèmes |
|---|---:|---:|
| `/` et `/pricing` — 390 / 768 / 1440 | **0** | **0** |
| `/login` et `/register` | 17 | 22 |

Les défauts de `/login` et `/register` sont corrigés (voir `BUG-THEME-011` et `-012`).

### IDE authentifié — bureau 1440, les deux thèmes

| Élément | avant | après |
|---|---:|---:|
| bouton **Run** (dégradé vert) | **2,48** au point le plus clair | **4,77** |
| **Stop** (aplat rouge, sombre) | **3,35** | **5,29** |
| **Economy / Next / Go to Manage** (aplat orange, sombre) | **2,80** | **6,33** |
| **Publish** (pastille claire) | **3,16** | **5,37** |
| pastille d'erreurs (clair) | **3,76** | **5,35** |
| pastille d'avertissements (clair) | **3,88** | **5,08** |
| pastille des journaux (clair) | **4,21** | ~5 |
| accroche du tour guidé (clair) | **4,43** | ~5 |

Les colonnes « après » du CSS sont **remesurées sur la production** avec la feuille
candidate injectée — « Run », « Publish », « Stop », « Next » et la pastille d'erreurs
disparaissent des échecs. Les valeurs portées par des composants (`text-white` remplacé
par un jeton) ne sont pas injectables : elles sont garanties par `on-accent-ink.spec.ts`
et par les valeurs de jetons relevées sur la page (`#c2410c` / `#dc2626` en clair,
`#f97316` / `#f85149` en sombre).

### Le motif à chercher ailleurs

Les trois plus grosses prises de la journée ont la même forme : **du texte clair posé
sur un fond dont la couleur varie** — dégradé orange du panneau d'authentification,
dégradé vert du bouton Run, aplat d'accent qui s'inverse avec le thème. Une
vérification jeton-contre-jeton passe à côté, parce que le fond réel n'est jamais la
valeur d'un jeton : c'est un dégradé, un mélange alpha, ou l'autre thème.
