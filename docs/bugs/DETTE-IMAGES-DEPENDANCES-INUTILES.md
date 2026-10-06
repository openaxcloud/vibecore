---
id: DETTE-IMAGES-DEPENDANCES-INUTILES
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Dette

**Les images de production embarquent des outils de construction, de test et des bibliothèques mobiles qu'elles
n'exécutent jamais. Deux des trois failles CRITIQUES qui bloquent la livraison du 2026-10-06 viennent de là, et
chaque nouvelle faille publiée dans l'un de ces paquets bloquera de nouveau.**

## Mesuré en production (2026-10-06, lecture seule, images servies par digest)

Inventaire du magasin pnpm DANS chaque pod (`qa-2026-10-06/images-inventaire-pod.cjs`), comparé au graphe du
fichier de verrouillage de `main` d3d34ef4c, par NOM de paquet pour neutraliser l'écart de versions.

| image | paquets | Mo |
|---|---|---|
| admin | 1 461 | 1 344 |
| ai-gateway | 1 409 | 1 577 |
| api | 1 476 | 1 625 |
| preview-proxy | 1 400 | 1 308 |
| screenshotter | 1 401 | 1 321 |
| web | 1 554 | 1 780 |
| worker | 1 408 | 1 526 |
| workspace-manager | 1 409 | 1 527 |

Un relais (`preview-proxy`) et une capture d'écran (`screenshotter`) pèsent 1,3 Go chacun.

## Trois mécanismes, chacun établi

### 1. Un outil de construction en production via une dépendance mal déclarée (toutes les images, 315 Mo chacune)

`@react-router/fs-routes` est une dépendance de PRODUCTION de la racine. Elle déclare `@react-router/dev` en
PAIR, et `autoInstallPeers: true` l'installe : `@react-router/dev → wrangler → workerd`.
- 77 paquets / 314 Mo de chaque image dorsale n'y sont QUE par cette chaîne : `workerd` 124, son binaire
  `@cloudflare/workerd-linux-64` 119, `miniflare` 18, `sharp` en DEUX variantes (musl 16 + glibc 16), `prettier` 8…
- `fs-routes` ne sert qu'à `app/routes.ts`, la configuration des routes lue AU BUILD. Le bundle serveur servi ne la
  contient pas (0 fichier ; témoin `react-router` : 35).
- Calculé sur le graphe : sans `fs-routes` en production, `@react-router/dev`, `wrangler` et `workerd` sortent de
  l'ensemble de prod. **81 paquets / 315 Mo disparaissent de chaque image dorsale.**

### 2. L'image web garde les dépendances de prod de TOUS les projets du dépôt (→ `@capacitor/android`)

`Dockerfile` : `pnpm install` complet, puis `pnpm prune --prod` à la racine d'un espace de travail. Ce `prune` garde
les dépendances de production de CHAQUE projet : l'app mobile (`@capacitor/android`), l'admin (`vitest`, voir 3), le
screenshotter (`playwright-core`), l'agent (`node-pty`). L'image web porte 123 paquets / 213 Mo hors de ce que
l'app web utilise. `@capacitor/android` (CVE critique bloquante) n'est que dans cette image.

### 3. `vitest` déclaré en dépendance de PRODUCTION de `apps/admin` (→ `tinypool`)

`tinypool` (CVE critique bloquante) vient de `vitest`, présent dans les images admin et web. `apps/admin` le déclare
dans `dependencies` ; partout ailleurs il est en `devDependencies`.

### Et la troisième faille

`perl-base` est un paquet du système de l'image de base : sans rapport avec ce qui précède.

## Ce qui n'est PAS vrai

Les outils de test « classiques » ne sont PAS dans les images dorsales : `playwright`, `@playwright/test`, `vitest`,
`eslint`, `typescript` y sont absents. `pnpm deploy --prod` les retire bien. Le problème se trouve dans les trois
mécanismes ci-dessus.

## Méthode et limites

- Premier essai invalidé par son contrôle positif : `fastify` sortait « inutile » pour l'API, parce que les
  services ne déclarent pas leurs dépendances. Elles sont à la RACINE (160 dépendances, celles de l'app web
  comprises). L'ensemble utile d'un service est donc sa fermeture PLUS celle de la racine. C'est généreux, donc le
  surplus mesuré est un minimum.
- Un second essai, par analyse des imports, donnait 95 à 99 % de surplus. Il n'est pas retenu : il manque le code
  généré (`@prisma/client` sortait « jamais importé ») et les chargements dynamiques.
- Corollaire, à traiter à part : tant que les services ne déclarent pas leurs propres dépendances, `pnpm deploy
  --filter <service> --prod` ne peut pas produire une image maigre.

## Remèdes, du moins risqué au plus large

1. `@react-router/fs-routes` → `devDependencies` (la construction l'a toujours) : −315 Mo par image dorsale.
2. `apps/admin` : `vitest` → `devDependencies` : retire `tinypool` de l'admin.
3. Image web : remplacer `pnpm prune --prod` par un déploiement filtré du seul projet web
   (`pnpm deploy --filter vibecore --prod`) : retire `@capacitor/android`, `playwright-core`, `node-pty`, `vitest`.
4. À plus long terme : chaque service déclare ses dépendances, et ses images ne portent que ce qu'il importe.

Chaque remède se vérifie par l'inventaire du pod avant/après, et par la porte de vulnérabilité.

## 📤

☐ à la session livraisons (elle traite les trois failles bloquantes, dans ces fichiers)

## 💻

☐

## ✅

☐

## Preuve

Inventaires des 8 pods et calculs du 2026-10-06 ; script d'inventaire dans `qa-2026-10-06/`. Les failles bloquantes
sont lues dans le run deploy-main 37440605010 (porte de vulnérabilité).
