# Isolation preview — les portes d'accès, avant toute bascule prod

Question posée : le jeton `vc_preview` (ou un mécanisme d'autorisation
équivalent) est-il porté sur **toutes** les portes d'accès à un preview, de sorte
qu'activer `PREVIEW_PROXY_ENFORCE_TENANT=true` en production n'y casse rien ?

Réponse courte : **non, deux portes sur quatre ne le portaient pas** — dont une qui
contournait entièrement la porte. Les deux sont corrigées ici. Le loader IDE (la
porte déjà connue comme OK) est confirmé.

Environnement de preuve : cluster d'audit `vibecore-audit-cluster`, workspace réel
`ws-porte` (org `org_porte`) en pod **gVisor**, serveur de dev réel sur les ports
5173 (HTTP) et 5174 (HTTP + WebSocket), `PREVIEW_PROXY_ENFORCE_TENANT=true` et
`PREVIEW_ENFORCE_PRIVATE_PORTS=true` vérifiés sur **les deux** répliques du proxy.
Jetons forgés **dans le pod** (le secret ne sort jamais du cluster).

## Le routage, d'abord

Une requête arrivant sur `*.preview.<domaine>` est triée dans
`services/preview-proxy/src/app.ts` (hook `onRequest`) :

| Forme d'hôte | Handler | Porte tenant ? |
|---|---|---|
| `d-<id>.<preview>` | `handleServerDeployRequest` (après `resolveServingVerdict`) | **non** — branche qui `return` avant le handler de preview |
| `s-<id>.<preview>` | `handleStaticDeployRequest` | **non** — idem |
| `<ws>-<port>.<preview>` | `handlePreviewRequest` | **oui** |
| `/p/<ws>/<port>/…` (chemin) | `handlePreviewRequest` | **oui** |
| upgrade WebSocket sur `<ws>-<port>` | `attachPreviewWebSocketProxy` | **était NON** → corrigé |

## Porte 1 — liens de preview DIRECTS ✅ portait déjà le jeton

**Chemin.** Navigateur → `<ws>-<port>.preview.e-code.ai` → hook `onRequest` →
`handlePreviewRequest` → porte tenant. C'est le **même handler** que l'iframe de
l'IDE ; la seule différence est le contexte de navigation, pas le code.

**Le cookie est-il envoyé ?** Oui en production. `previewTenantCookie`
(`app/lib/.server/preview-tenant.ts`) le pose avec `Domain=themeCookieDomain(hostname)`
et, en production, `SameSite=None; Secure`. Calcul réel :

```
app.e-code.ai                 -> Domain=.e-code.ai      (couvre *.preview.e-code.ai)
e-code.ai                     -> Domain=.e-code.ai
app.34.163.208.161.sslip.io   -> Domain=.sslip.io
```

**Preuve live** (proxy, enforcement strict) :

```
sans cookie (navigation neuve / incognito)   HTTP 403
cookie legitime (org_porte)                  HTTP 200  + le vrai HTML du dev server
cookie d'un autre tenant (org_pirate)        HTTP 404  (refus de propriete amont)
```

**Limite honnête, et conséquence produit.** Le cookie n'existe que si le
navigateur a chargé l'IDE dans la fenêtre de TTL. Un lien de preview ouvert dans
un navigateur neuf, en navigation privée, sur un autre appareil, ou **transmis à
un tiers**, n'a pas de cookie et recevra **403**. C'est précisément l'effet voulu
d'une isolation par tenant, mais c'est un **changement de comportement visible** :
aujourd'hui une URL de preview est utilisable par quiconque la détient. À
arbitrer avant la bascule — ce n'est pas un défaut technique, c'est une décision.

> Artefact de l'environnement d'audit, sans effet sur la prod : les hôtes y sont
> en `<ip>.sslip.io`, dont les deux derniers labels donnent `Domain=.sslip.io`, un
> **suffixe public** que les navigateurs refusent. La livraison du cookie par un
> vrai navigateur n'est donc pas testable ici ; elle l'est en prod, où
> `.e-code.ai` est un domaine enregistrable. La porte elle-même est prouvée
> ci-dessus côté proxy.

## Porte 2 — hôtes de déploiement `d-<id>` ✅ non concernée

**Chemin.** `parseServerDeployHost` matche avant le parse de preview, puis
`resolveServingVerdict` (garde d'extinction 30 j) puis `handleServerDeployRequest`,
et la branche `return`. `handlePreviewRequest` — donc la porte tenant — n'est
**jamais** atteint. C'est cohérent avec l'intention : une publication est un site
**public**, elle n'a pas de cookie de tenant à porter.

**Preuve live** (enforcement strict, sans cookie) :

```
d-porte123.preview.<ip>.sslip.io     HTTP 503  PUBLICATION_STATE_UNAVAILABLE
d-inexistant.preview.<ip>.sslip.io   HTTP 503  PUBLICATION_STATE_UNAVAILABLE
— contraste, MÊME proxy, hôte de preview —
ws-porte-5173.preview.<ip>.sslip.io  HTTP 403  PREVIEW_TENANT_FORBIDDEN
```

Le 503 est le verdict de publication (ces identifiants n'existent pas en base),
**pas** un refus tenant : aucun `PREVIEW_TENANT_FORBIDDEN` n'apparaît jamais sur
cette forme d'hôte. Activer l'enforcement ne peut donc pas la casser.

**Non prouvé ici** : un 200 sur une publication réellement `live`, faute de
déploiement publié sur l'env d'audit (`resolveServingVerdict` exige que l'API
réponde `state: 'live'`). Ce qui est établi est ce qui compte pour la décision :
l'enforcement n'introduit aucun refus sur ce chemin.

## Porte 3 — screenshotter (vignettes) ❌ ne portait PAS le jeton → corrigé

**Chemin.** `api` → `POST /capture` du screenshotter → Playwright ouvre un
contexte **neuf et isolé** (`services/screenshotter/src/browser.ts` : « fresh,
isolated context so cookies/storage never leak between projects ») → il réécrit
l'URL vers le Service in-cluster du proxy **en conservant le Host** → le proxy
route par Host sur `handlePreviewRequest`. Le bearer `SCREENSHOTTER_SHARED_SECRET`
n'autorise que l'appel **entrant** api→screenshotter ; **rien** n'était porté vers
le preview.

**Ce n'était pas théorique** : en production `SCREENSHOTTER_URL` est renseigné, le
pod tourne, et `SCREENSHOTTER_ALLOWED_HOSTS=preview.e-code.ai`.

**Preuve live du défaut** (forme de requête exacte du screenshotter, in-cluster,
Host de preview préservé) :

```
comme le screenshotter (SANS cookie)        HTTP 403  PREVIEW_TENANT_FORBIDDEN
contrefactuel : avec un cookie legitime     HTTP 200  + le vrai HTML
```

Toutes les vignettes auraient cassé à la seconde où le drapeau passait en prod.

**Correctif.** L'API mint un jeton court (5 min) pour l'organisation du projet
(`services/api/src/preview-tenant-token.ts`) et le passe au screenshotter, qui le
présente sur l'en-tête interne `x-vibecore-preview-tenant` que le proxy accepte —
**uniquement** vers les hôtes de preview déjà validés par l'allowlist SSRF. Même
credential, même vérificateur, aucun bypass ajouté ; un en-tête explicite est même
plus sûr qu'un cookie envoyé automatiquement (pas de sémantique CSRF). L'en-tête
est **retiré avant tout forward** amont : le serveur de dev du tenant ne le voit
jamais. Parité de schéma vérifiée en test : un jeton mint par l'API est accepté par
le vérificateur du proxy, un mauvais secret et un jeton expiré sont rejetés.

## Porte 4 — WebSocket HMR ❌ contournait la porte → corrigé

**Trouvée en tirant le fil du routage** : elle n'était dans aucune des trois portes
demandées, et c'est la plus grave.

**Chemin.** `attachPreviewWebSocketProxy` (`preview-ws-proxy.ts`) appelait
`resolveAgent(target.workspaceId)` — **sans orgId, sans lire le cookie**. Aucune
branche d'autorisation n'existait sur ce handler.

**Preuve live du défaut** (même hôte de preview, upgrade au lieu de GET, avec
`PREVIEW_PROXY_ENFORCE_TENANT=true` et un serveur WebSocket réel dans le
workspace) :

```
SANS cookie                    101 UPGRADE ACCEPTE + donnees recues: "SECRET-DU-TENANT-A"
cookie INTRUS (org_pirate)     101 UPGRADE ACCEPTE + donnees recues: "SECRET-DU-TENANT-A"
cookie legitime (org_porte)    101 UPGRADE ACCEPTE + donnees recues: "SECRET-DU-TENANT-A"
```

La porte HTTP répondait 403 pendant que l'upgrade livrait les octets amont. Une
porte qui filtre `GET` mais pas `UPGRADE` n'est pas une porte, et la socket HMR de
Vite transporte le **source des modules** : canal de lecture inter-tenant.

**Correctif.** Le jeton est vérifié **avant** toute résolution amont (403 sinon),
et l'orgId est transmis à `resolveAgent` dans les **deux** modes, pour que le
`workspace-manager` refuse un décalage de propriétaire même enforcement éteint —
exactement ce que fait déjà le chemin HTTP. 5 tests d'intégration sur le handler
(refus sans cookie sans jamais résoudre l'amont, refus sur jeton forgé, orgId
transmis, orgId transmis même enforcement éteint, environnement non opté intact).

## Preuves APRÈS correctif (image `3a537e9a7e`, flotte du proxy uniforme vérifiée)

Porte 3, forme de requête exacte du screenshotter corrigé — en-tête, toujours
aucun cookie :

```
sans jeton (comportement AVANT)          HTTP 403  PREVIEW_TENANT_FORBIDDEN
en-tete jeton LEGITIME (le correctif)    HTTP 200  + le vrai HTML du dev server
en-tete jeton INTRUS                     HTTP 404  (refus de propriete amont)
en-tete jeton bidon                      HTTP 403  PREVIEW_TENANT_FORBIDDEN
```

Porte 4, upgrade WebSocket sur un port servant réellement une socket :

```
SANS cookie ni jeton          REFUSE par le proxy: HTTP 403      (avant: 101 + donnees)
cookie INTRUS (org_pirate)    REFUSE par le proxy: HTTP 502      (avant: 101 + donnees)
cookie bidon                  REFUSE par le proxy: HTTP 403      (avant: 101 + donnees)
cookie LEGITIME (org_porte)   101 + DONNEES: "SECRET-DU-TENANT-A"  (acces legitime preserve)
```

Le 502 sur l'intrus est la traduction du refus de propriété du
`workspace-manager` (signature valide, mais l'org ne possède pas ce workspace,
donc aucun agent n'est résolu). C'est un refus sans aucun octet applicatif — le
code diffère du 404 du chemin HTTP, ce qui vaut d'être harmonisé un jour, mais la
substance est identique.

## Verdict

| Porte | Portait le jeton ? | Après correctif |
|---|---|---|
| Loader IDE (déjà connu OK) | oui | oui |
| 1. Liens directs | oui (en prod) | oui — mais **changement de comportement** sur les liens partagés |
| 2. Hôtes `d-<id>` | sans objet (chemin non gardé) | inchangée |
| 3. Screenshotter | **non** | oui, par en-tête interne |
| 4. WebSocket HMR | **non — contournement** | oui, refus 403 |

**Sûr d'activer en production : pas encore**, et deux raisons distinctes :

1. **Technique** — les correctifs des portes 3 et 4 doivent être déployés
   **avant** le drapeau. Ils vivent dans les images `preview-proxy`, `api` et
   `screenshotter` : activer l'enforcement sur des images antérieures casse les
   vignettes et laisse la socket HMR ouverte.
2. **Produit** — la porte 1 rend les URL de preview **non partageables**. C'est
   l'effet recherché, mais c'est une décision, pas un détail d'implémentation.

Ordre de bascule proposé, une fois ces images en prod : déployer d'abord les
correctifs (drapeau **éteint**, aucun changement de comportement), vérifier que
les vignettes se capturent toujours et que l'IDE fonctionne, **puis** allumer
`platformEnv.preview.enforceTenant` — en le re-`--set`ant, puisque le CD déploie
en `--reuse-values` et perdrait la clé.
