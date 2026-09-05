# Où va réellement le poids JS — mesure directe, 2026-09-05

Env mesuré : `https://app.34.163.208.161.sslip.io/` (page d'accueil, HTTP direct,
aucun recoupement avec un build local — les noms de chunks d'un build local NE
correspondent PAS à ceux de l'env servi, vérifié).

## Ce que le navigateur reçoit

| | |
|---|---|
| routes dans `window.__reactRouterManifest` | **4** |
| dont routes `api.*` | **0** |
| assets `modulepreload` dans le HTML | **36** |
| poids total JS | **982,6 Kio compressés** / 3 558,5 Kio bruts |

Le manifeste navigateur ne contient que les routes de l'URL courante : React
Router 7 découvre les autres à la demande (`/__manifest`). Les 139 routes `api.*`
du dépôt n'y sont pas.

## Le chunk que je croyais coûteux

`assets/api.integrations.api-key._provider.configure-*.js` — préchargé sur la
page d'accueil, contient 191 modules de route dans le build local équivalent.

**Poids mesuré : 10,3 Kio compressés / 37,1 Kio bruts — 1,0 % du JS de la page.**

Les 176 fichiers `api.*` du dépôt n'exportent que `loader` (68) et `action` (65),
plus des ré-exports nommés. Ce sont des exports **serveur**, retirés au build
client. Il reste un enregistrement de module qui ne rend presque rien : ~200
octets bruts en moyenne par route. Le poids du chunk vient de ses treize modules
*partagés* (catalogues i18n, `EcodeBrandMark`, `debounce`, `useCoarsePointer`),
pas des routes.

## Réponse à la question posée

Les routes `api.*` sont dans le graphe **de construction**, pas dans le coût de
chargement. Le framework fait ce qu'il doit. Le plancher est structurel **et
négligeable** : il n'y a rien à gagner de ce côté.

## Les huit assets qui portent réellement le poids

| Kio compressés | Kio bruts | asset |
|---:|---:|---|
| 246,9 | 931,0 | `runtime` |
| 220,0 | 706,1 | `vendor-react` |
| 102,6 | 468,0 | `upgrade` |
| 37,0 | 122,9 | `security` |
| 36,7 | 111,2 | `Badge` |
| 33,6 | 81,1 | `LandingLanguages` |
| 26,3 | 112,4 | `marketing-community-route` |
| 21,6 | 72,6 | `account-settings._index` |

Trois assets font **58 %** du poids. Le chunk `api.*` en fait 1 %.

## Témoins de validité

- 36/36 assets rendent une taille non nulle (le `curl` mesure bien).
- Un premier `grep` sur le bundle minifié cherchant `EcodeBrandMark` a rendu 0
  fichier alors que le composant est certainement côté client : **la minification
  réécrit les identifiants**. Ce grep a été abandonné, aucune conclusion n'en a
  été tirée.
- Un `grep -E '^\>'` pour lire une sortie `diff` a rendu 0 : en `grep -E`, `\>`
  est une ancre de fin de mot, pas un chevron. Corrigé, témoin posé.
