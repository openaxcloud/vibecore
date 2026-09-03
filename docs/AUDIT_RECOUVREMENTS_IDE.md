# Recensement des recouvrements — un écran, combien d'implémentations ?

**Date** : 2026-09-02 · **Commit mesuré** : `c3d0d18d9` (`origin/main`, arbre propre)
**Origine** : point d'Avi sur le doublon « Domaines », puis sa demande de pousser
le recensement jusqu'au bout.

Trois axes comparés systématiquement :

1. la **grille des outils** (`PROJECT_EDITOR_TOOLS`, 29 outils) ;
2. les **onglets internes** de chaque panneau (`PanelToolTabs` + jeux ad hoc) ;
3. les **routes de la zone utilisateur** (`app/routes/projects.$projectId.*`).

---

## Ce que le recensement a changé dans le diagnostic

L'hypothèse de départ était du rangement : « le même écran est offert deux fois ».
Elle est fausse dans les deux sens, et c'est le résultat le plus utile :

- **Domaines** (BUG-IDE-014) : ce n'étaient PAS deux implémentations, mais un même
  composant monté deux fois. Coût réel : nul. Corrigé, PR #379.
- **Terminal → Environment / Connections** (R-2, R-3) : c'étaient bien deux
  implémentations, et elles **divergeaient** — dont une perte de données
  silencieuse. Coût réel : élevé. Corrigé, PR #384.
- **Domaines, en profondeur** (R-1) : quatre écrans décrivent une fonctionnalité
  que la plateforme **ne rend pas**, pendant qu'ils pilotent une fonctionnalité
  **de sécurité** qu'ils ne nomment jamais. Coût réel : à trancher par Avi.

La duplication n'est donc pas le défaut : elle est le **symptôme** qui permet de
le trouver. Deux implémentations d'un écran finissent toujours par diverger, et
c'est la divergence qui produit les bugs.

---

## R-1 — « Domaines personnalisés » : cinq surfaces, et aucune ne fait ce qu'elle annonce

### La mesure

`VerifiedDomain` (table `packages/database/prisma/schema.prisma:1364`) a
**exactement deux consommateurs** dans tout le dépôt :

| Consommateur | Fichier | Ce qu'il fait |
|---|---|---|
| SAML ACS | `services/api/src/app.ts:10737` | refuse une assertion dont le domaine d'e-mail n'est pas vérifié (403 `SAML_EMAIL_DOMAIN_NOT_VERIFIED`) |
| SCIM | `services/api/src/app.ts:37331` | refuse d'enrôler un utilisateur dont le domaine n'est pas vérifié (403 `SCIM_EMAIL_DOMAIN_NOT_VERIFIED`) |

**Aucun consommateur d'hébergement.** Vérifié dans les deux sens :

- les hôtes d'ingress viennent de valeurs Helm statiques
  (`infra/helm/platform/templates/ingress.yaml` : `appDomain`, `previewDomain`,
  listes figées) — jamais de `VerifiedDomain` ;
- rien dans `services/workspace-manager`, `services/preview-proxy` ni `infra/`
  ne lit un domaine vérifié ;
- `Deployment.customDomain` (`schema.prisma:812`) est une **chaîne libre saisie
  dans l'assistant Publier**, seulement validée, stockée, recopiée au clone et
  au rollback, puis réaffichée. Aucun lecteur opérationnel. Elle n'est reliée à
  `VerifiedDomain` par aucune jointure.

### Les cinq surfaces

| # | Surface | Cadrage | Exact ? |
|---|---|---|---|
| 1 | `/organization-domains`, atteinte depuis **Réglages de sécurité** (aux côtés de SSO, SCIM, rôles, journaux d'audit, SIEM) | sécurité d'entreprise | ✅ **oui** |
| 2 | `ProjectDomainsPanel` (IDE) — « Production routing, DNS verification and managed TLS », « Use this host as the CNAME or ALIAS target » | hébergement | ❌ |
| 3 | `projects.$projectId.domains.tsx` — « Map project deployments to verified domains with TLS readiness » | hébergement | ❌ |
| 4 | `DeployDomainsView` — « point your domain's DNS (CNAME) at the deployment ; managed TLS coming soon » | hébergement | ❌ |
| 5 | Champ « Domaine personnalisé » de l'assistant Publier | hébergement | ❌ (écrit une chaîne inerte) |

### Les deux conséquences, et la seconde est la sérieuse

1. **Rien n'est hébergé.** Qui suit les instructions n'obtient ni routage ni TLS.
2. **Autre chose se produit à la place.** Vérifier un domaine pour « héberger son
   app » **autorise silencieusement les assertions SAML et l'enrôlement SCIM**
   pour toute identité de ce domaine dans l'organisation. Aucun des quatre écrans
   d'hébergement ne le dit.

### Pourquoi je n'ai pas tranché

L'arbitrage « laquelle des implémentations survit » **dépend d'une décision
produit** que je ne peux pas prendre : l'hébergement sur domaine personnalisé
est-il censé exister ?

- **s'il doit exister** → il manque tout le back-end (routage, émission TLS,
  jointure déploiement↔domaine) ; supprimer des écrans serait supprimer la seule
  trace de la fonctionnalité attendue ;
- **s'il ne doit pas exister** → les quatre écrans d'hébergement doivent
  disparaître au profit du seul cadrage exact (n° 1), et le champ de l'assistant
  Publier avec eux.

Les deux chemins sont de gros changements de produit dans des directions
opposées. **C'est le blocage, et il est chiffré** : 5 surfaces, 2 consommateurs
réels, 0 consommateur d'hébergement.

### Ce que j'ai livré malgré le blocage

- Le commentaire de `organization-domains.tsx` affirmait que la page par projet
  était « distincte » : **c'était faux**, elle appelle les mêmes endpoints.
  Corrigé, avec la mesure ci-dessus consignée sur place.
- Le contrôle SAML n'avait **aucun test discriminant** : le test SAML existant
  vérifie `example.com` avant d'asserter, donc il reste vert si l'on retire le
  contrôle. Ajouté dans `services/api/src/tests/api.spec.ts` — assertion signée
  valide, domaine non vérifié → 403, **plus la contre-épreuve inverse** (le même
  flux réussit une fois le domaine vérifié, sinon une route qui refuse tout
  passerait le test). Contre-épreuve exécutée : contrôle retiré → rouge.

⚠️ `projects.$projectId.domains.tsx` n'est PAS touché : la session « Livraisons »
y corrige le défaut d'écriture (dériver l'organisation du projet). Non refait ici.

---

## Recouvrements traités

| # | Recouvrement | Verdict | État |
|---|---|---|---|
| **BUG-IDE-014** | Carte « Domaines » de la grille ↔ onglet Deploy → Domaines | même composant, deux portes | ✅ corrigé — PR #379 |
| **R-2** | Terminal → « Environment » ↔ outils `Env vars` + `Secrets` | **deux implémentations divergentes** : le Terminal n'envoyait pas de `scope`, le magasin retombe sur `production` ; supprimer une variable `preview` supprimait celle de production | ✅ corrigé — PR #384 |
| **R-3** | Terminal → « Connections » ↔ outil `Ports` | même helper, second rendu appauvri (ni port primaire ni public/privé) | ✅ corrigé — PR #384 |
| **R-4** | Cartes `Env vars` et `Secrets` | même clé de description → indiscernables dans la grille | ✅ corrigé — PR #384 |

## Recouvrements ouverts

| # | Recouvrement | Gravité | Pourquoi non corrigé |
|---|---|---|---|
| **R-1** | 5 surfaces « domaines », 0 consommateur d'hébergement | **à trancher** | décision produit — voir ci-dessus |
| **R-8** | **Troisième écrivain de variables d'env sans `scope`** : le panneau `database` (`ide-panel.$panel.ts:1979` `delete-env`, et un `PUT` de repli sur `DATABASE_URL`). Même classe que R-2 | moyenne | hors périmètre R-2 ; toucher au câblage `DATABASE_URL` sans mesurer le flux de provisioning serait exactement l'erreur que la règle 1 interdit |
| **R-9** | **Zone utilisateur ↔ panneaux IDE** : 12 routes `projects.$projectId.*` ont un panneau IDE homonyme, avec des composants entièrement séparés sur les **mêmes** endpoints | **haute** | **mesuré en détail le 03/09 — voir la section dédiée en fin de document.** 4 divergences réelles (dont `snapshots`, une opération DESTRUCTRICE à deux portées), 5 paires alignées, 1 collision de nom. Les consolidations imposent `BaseChat.tsx`, territoire d'une autre session |

## Non-défauts établis (à ne pas fusionner)

| # | Ressemblance | Pourquoi ce n'est pas un doublon |
|---|---|---|
| R-5 | Deploy → « Overview » / « Logs » ↔ outils `Overview` / `Logs` | recouvrement de **nom** seulement : état du déploiement vs résumé projet ; journaux de build vs flux runtime |
| R-6 | Object Storage → « Settings » ↔ outil `Settings` | réglages du bucket vs réglages du projet |
| R-7 | Integrations → « API keys » ↔ outil `Secrets` | magasins distincts — `state.apiKeys` du panneau, pas `/projects/:id/secrets` |

**Déjà alias, pour mémoire** : `checkpoints` → `snapshots`, `kv-store` →
`database`, `storage` → `object-storage` ne produisent aucune carte de grille.
C'est le précédent sur lequel s'appuie le correctif de BUG-IDE-014.

---

## Ordre recommandé pour la suite

1. **R-1** — décision d'Avi (hébergement : oui ou non). Rien d'autre ne peut avancer dessus.
2. **R-9**, paires écrivantes d'abord (`env`, `secrets`, `collaborators`, `deployments`) : c'est là que se cachent les prochaines divergences du type R-2.
3. **R-8** — après avoir mesuré le flux de provisioning `DATABASE_URL`.

⚠️ **Aucun point de ce document n'est ✅ « Testé live »** : les correctifs sont
en PR, non mergés, non déployés. La preuve prod datée revient à la session
« Livraisons + preuves prod ».

---

## R-9 — mesure détaillée des 12 paires « zone utilisateur ↔ panneau IDE »

**Mesuré le 2026-09-03** sur `origin/main` (`7f5309c68`). Pour chaque paire :
mêmes endpoints ? mêmes capacités ? même portée pour la même action ?

Le résultat n'est pas « le même écran deux fois ». C'est pire et plus utile :
**aucune paire n'est un sur-ensemble de l'autre**. Chaque écran fait un
sous-ensemble différent, sous le même nom, sans jamais le dire.

### Divergences réelles

| Paire | Zone utilisateur | Panneau IDE | Conséquence |
|---|---|---|---|
| **`snapshots`** ⚠️ | `restore` + **`restore-preview`** (diffstat à blanc avant de confirmer) | `restore` + **restauration de la BASE** en option (`POST /projects/:id/database/restores`) | **Le même bouton « Restaurer » n'a pas la même portée selon l'écran.** Mesuré : `POST /snapshots/:id/restore` ne touche PAS la base (témoin positif : 27 occurrences de « snapshot » dans le handler, 0 de la base). Depuis le tableau de bord, le code recule pendant que le schéma et les données restent en avant. Depuis l'IDE, aucune pré-visualisation avant une opération destructrice. |
| **`collaborators`** | ajouter / retirer un collaborateur, créer / révoquer un lien de partage | commentaires, permission terminal, partage IA, lien de partage | **Ensembles disjoints.** Impossible d'ajouter un collaborateur depuis l'IDE ; impossible d'accorder une permission terminal depuis le tableau de bord. Deux écrans, un seul nom. |
| **`deployments`** | `detect` (détection du framework) + `rate-card` (estimation de coût) | ni l'un ni l'autre — la création code en dur `npm run build` / `dist` | Publier depuis l'IDE se fait sans détection ni estimation de coût, silencieusement. |
| **`settings`** | réglages du **projet** (`PATCH /projects/:id/settings`) | compte et préférences (`/auth/me`, mot de passe, sessions) + env/secrets | **Collision de nom, pas doublon.** L'outil « Settings » de l'IDE n'affiche jamais les réglages du projet ; l'entrée « Settings » du tableau de bord n'affiche jamais le compte. Même classe que R-4. |

### Paires alignées (vérifiées, aucun écart)

| Paire | Vérification |
|---|---|
| `env` | les deux envoient `scope` en écriture ET en suppression |
| `secrets` | `PUT` / `DELETE` `{key, value}` des deux côtés |
| `logs`, `activity`, `git`, `preview`, `database` | routes de la zone utilisateur en lecture seule — aucune écriture à faire diverger |

### Non-défaut écarté après vérification

L'action de déploiement de l'IDE construit un segment d'URL depuis l'`intent`
utilisateur (`/deployments/:id/${intent}`). Vérifié : il est filtré par **liste
blanche** (`cancel | redeploy | rollback`) avant interpolation. **Pas
d'injection** — mentionné parce que l'écarter demandait de le lire, pas de le
supposer.

### Ce qui est corrigé, et ce qui ne peut pas l'être ici

Le correctif de fond — un composant, l'autre en alias, comme pour R-2 — impose
de modifier `app/components/chat/BaseChat.tsx`, où vivent tous les panneaux IDE.
**Ce fichier est le territoire d'une autre session** et a provoqué des conflits
toute la journée du 02/09. Les consolidations R-9 sont donc **à faire par la
session qui tient ce fichier**, pas ici.

Ce qui était corrigeable côté routes l'a été : le tableau de bord **dit
désormais** que la restauration ne rejoue pas la base. Une opération
destructrice dont la portée n'est pas annoncée est un piège à données ; le
message est rendu au niveau du **dialogue**, pas du diffstat — sa propre garde a
révélé qu'un placement à l'intérieur de la pré-visualisation ne l'affichait
jamais pendant le chargement ni en cas d'échec, c'est-à-dire précisément quand
l'utilisateur confirme à l'aveugle.

### Ordre recommandé pour la session qui tient `BaseChat.tsx`

1. **`snapshots`** — le plus urgent avant lancement : deux portées pour une
   action destructrice. Soit la pré-visualisation passe dans l'IDE et la
   restauration de base dans le tableau de bord, soit un seul écran survit.
2. **`collaborators`** — ensembles disjoints, donc chaque écran est incomplet.
3. **`deployments`** — remonter `detect` et `rate-card` dans l'IDE.
4. **`settings`** — renommer, pas fusionner : ce sont deux écrans légitimes.

---

## Axe 4 — routes hors projet (recensement clos le 2026-09-03)

Le quatrième et dernier axe : les ~180 routes qui ne sont pas sous
`projects.$projectId.*`. Recherche par grappes de noms, puis lecture de chaque
grappe suspecte.

### Grappes vérifiées SAINES — à ne pas « corriger »

| Grappe | Chemins | Verdict |
|---|---|---|
| Profils publics | `/profile/:username`, `/u/:username`, `/user/:username` | **Non-défaut.** Les trois lancent un 404 honnête, documenté, parce qu'E-Code n'a aucun back-end de profil public. Trois chemins, un comportement, assumé (G26). |
| Réglages | `/settings`, `/settings/:tab`, `/account-settings`, `/user/settings`, `/workspace-settings` | **Non-défaut.** `/settings` et `/settings/:tab` montent le MÊME `ControlPanel`, l'un avec un onglet présélectionné — le motif d'alias exact recommandé pour BUG-IDE-014. `/user/settings` fait une redirection 301. `/workspace-settings` est un écran distinct. |
| Projet public | `/$accountSlug/$projectSlug`, `/u/:username/:projectname`, `/$slug` | **Non-défaut.** Résolution réelle ou 404 franc selon le cas ; pas de contenu inventé. |

### Défaut trouvé et corrigé

| Chemin | Défaut | État |
|---|---|---|
| **`/project/:id`** | Rendait une page MARKETING « Project Compatibility Overview » décrivant « legacy E-Code project {projectId} » pour n'importe quelle chaîne, publiquement, en **HTTP 200**. Même « fausse brochure » que G26 a corrigée sur les trois routes de profil — **celle-ci a été oubliée**. | ✅ **PR #408** — 301 vers `/projects/:id`, fabrique et 24 clés de copie orphelines retirées, garde anti-redirection-ouverte |

### Dette signalée, non touchée

`createProfileSurfacePage` et `createTeamSurfacePage` restent **orphelines** sur
`main` : G26 a cessé d'utiliser la première sans la retirer. Elles ne découlent
pas des changements de cette campagne et n'y sont donc pas mêlées, mais elles
appartiennent à la dette des composants morts qu'Avi paie ailleurs.

---

## R-8 — le troisième écrivain sans `scope`, réglé

La branche `database` de la route de panneaux finissait par un `else` qui, pour
tout intent non reconnu, faisait
`PUT /env-vars { key: body.key || 'DATABASE_URL', value: body.value ?? '' }` —
soit l'écrasement de la chaîne de connexion par une valeur VIDE, avec `ok: true`.

Inatteignable aujourd'hui (seuls `provision`, `query` et `upsert-secret`
arrivent là), mais un chemin d'écriture inatteignable reste une arme chargée :
le premier intent ajouté sans branche l'aurait déclenché. **Échoue désormais en
400** — ✅ **PR #407**.

⚠️ La première mesure d'atteignabilité était **fausse** : un motif quoté
(`'upsert-secret'`) manquait les formulaires JSX `value="upsert-secret"` et
rendait « 0 émetteur » pour des intents vivants. Refaite en chaîne fixe avec
témoin positif. Sans ce contrôle, je supprimais du code atteignable — règle 14,
appliquée en situation.

---

## État de la campagne au 2026-09-03

| Point | État |
|---|---|
| BUG-IDE-014 — carte Domaines en double | ✅ PR #379 |
| R-2 — Terminal ↔ Env vars / Secrets (divergence de `scope`) | ✅ PR #384 |
| R-3 — Terminal ↔ Ports | ✅ PR #384 |
| R-4 — descriptions identiques | ✅ PR #384 |
| R-1 — garde du contrôle SAML + mesure des 5 surfaces | ✅ PR #386 (arbitrage produit en attente d'Avi) |
| R-9 `snapshots` — restauration à deux portées | ✅ PR #397 (message honnête ; consolidation = `BaseChat.tsx`) |
| R-8 — repli destructeur du panneau base de données | ✅ PR #407 |
| Axe 4 — `/project/:id` fausse brochure | ✅ PR #408 |

**Reste ouvert, et pourquoi :**

1. **R-1, l'arbitrage** — décision produit d'Avi : l'hébergement sur domaine
   personnalisé doit-il exister ? Les deux issues sont de gros changements en
   sens opposés.
2. **R-9, les consolidations** (`snapshots`, `collaborators`, `deployments`,
   `settings`) — toutes dans `app/components/chat/BaseChat.tsx`, territoire
   d'une autre session.
3. **Fabriques de surface orphelines** — `createProfileSurfacePage`,
   `createTeamSurfacePage`.
