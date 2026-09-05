# Ce qui remplit les secondes : ni le poids, ni le CPU, ni une file d'attente

Mesure du 2026-09-05, env de test `app.34.163.208.161.sslip.io`, page projet
(`/<org>/<projet>`, compte créé pour la mesure), sonde
`tmp/qa-sweep/cascade.mjs`. Trois échantillons WebKit/iPhone 15 Pro + un
Chromium 1440.

> **Limite assumée.** WebKit tourne ici sur le CPU du Mac. La part **CPU** est
> donc un plancher, pas celle du téléphone d'Avi. Les allers-retours et
> l'attente serveur, eux, sont fidèles.

## 1. Il n'y a pas de file d'attente

| | WebKit/iPhone | Chromium |
|---|---:|---:|
| requêtes | 73 | 56 |
| parallélisme **max** | 49 simultanées | — |
| parallélisme moyen | 8,8 | — |
| temps mural | 3 214 / 3 365 / 5 006 ms | 2 334 ms |
| cumul des téléchargements | 34,7 s | — |

Le facteur ~9× entre le cumul et le temps mural n'est pas une file : c'est du
multiplexage HTTP/2. **49 requêtes tiennent l'air en même temps.** L'hypothèse
« trente-six requêtes se disputent six connexions » est réfutée.

## 2. Ce n'est pas du CPU non plus

| | échantillon 1 | 2 | 3 |
|---|---:|---:|---:|
| réseau **oisif** (0 requête en vol) | 278 ms | 281 ms | 297 ms |
| part du temps mural | 8 % | 6 % | 9 % |

Le réseau est **actif 91 à 94 %** du temps. Sur la page d'accueil, il ne reste
que **65 ms** de travail CPU après le dernier octet. Sur un vrai iPhone cette
part grandirait, mais elle part de très bas.

## 3. Le coût, ce sont les allers-retours

**Répartition par nature (WebKit, 73 requêtes) :**

| nature | requêtes | TTFB médian | somme TTFB | temps de transfert |
|---|---:|---:|---:|---:|
| statique (`/assets/`, css, webmanifest) | **65** | **452 ms** | 33 621 ms | 3 571 ms |
| API | 2 | 203 ms | 317 ms | 23 ms |
| autre | 6 | 100 ms | 706 ms | 175 ms |

Les fichiers statiques passent **90 % de leur temps réseau à attendre** et 10 %
à transférer.

**Et le serveur n'est pas lent :**

| | |
|---|---:|
| RTT TCP (`time_connect`) | **85 ms** |
| poignée TLS supplémentaire | 80 ms |
| TTFB, première requête (connexion neuve) | 242 ms |
| TTFB, **connexion réutilisée** | **108–121 ms** |
| ⇒ traitement serveur réel | **~25 ms** |

Le TTFB, c'est de la **distance** plus de l'ordonnancement de flux, pas du
calcul. Et l'hôte `34.163.208.161.sslip.io` résout directement vers
l'équilibreur : **aucun CDN n'est possible devant cet env**, chaque asset fait
l'aller-retour complet vers europe-west9.

## 4. Sept à huit vagues successives

Départs de vague mesurés : `0, 286, 718, 2406, 2894, 3314, 3496` ms.

Chaque vague part quand la précédente a été analysée — le réseau est oisif ou
quasi oisif à l'instant du départ. La chaîne :

1. le document HTML
2. les CSS et le webmanifest
3. **49 chunks JS** d'un coup
4. 11 chunks supplémentaires (`debugLogger`, `mobile`, `inspector`, `wasm`)
5. `__manifest?paths=…` — la découverte paresseuse de routes de React Router
6. `webcontainer` + `fetch.worker`
7. `semver`

Sept dépendances en série, chacune coûtant au minimum un aller-retour.

## 5. Le cache est correct

`cache-control: public, max-age=31536000, immutable` sur les assets hachés,
`304` vérifié avec `If-None-Match`, `no-store` sur le document. **Les 9 secondes
sont un coût de visite à froid**, pas un défaut de cache.

## Témoins de validité

- 73 requêtes capturées par la sonde contre 67 vues par `performance` — les deux
  sources concordent à l'ordre de grandeur ; une capture nulle aurait fait
  échouer la sonde par construction (`process.exit(1)`).
- **Première tentative invalide** : `getEntriesByType('navigation')` est vide sur
  WebKit — `domInteractive` valait 0 et `loadEventEnd` `NaN`. Aucune conclusion
  n'a été tirée de ce passage ; la sonde retombe sur `performance.timing` et
  **affiche sa source** (`sourceTiming`).
- Trois échantillons WebKit, dont un à 5 006 ms contre 3 214 ms : la variance
  est réelle et vient du serveur. Un échantillon unique aurait menti de 55 %.
