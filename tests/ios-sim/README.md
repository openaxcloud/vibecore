# Banc mobile sur vrai Safari iOS (simulateur Xcode)

**État : PRÉPARÉ, NON VALIDÉ.** Aucun parcours n'a encore tourné jusqu'au bout.
Tant que le banc n'a pas montré les deux défauts connus (zone de saisie sous le
clavier, zoom sous 16 px), il ne prouve rien.

## Pourquoi

Toute la validation mobile tourne sur Chromium, et le projet Playwright
`webkit-iphone` n'est pas Safari iOS : il n'a ni clavier logiciel, ni zoom au
focus, ni barre d'outils qui recouvre la fenêtre de mise en page. Les specs
`agent-composer-panel-viewport`, `ios-input-zoom` et `ios-zoom-floor-live`
**simulent** ces phénomènes. Ce banc les **provoque**.

## Pré-requis (une fois)

- Xcode avec le runtime iOS 26.4. Mesuré le 2026-09-28 : présent.
- Sur le Mac, avec mot de passe administrateur : `safaridriver --enable`.
- Le banc crée et règle SON appareil `vc-banc-ios-390` (iPhone 17e, 390 pt) :
  - automatisation à distance activée ;
  - clavier matériel coupé, **pour cet appareil seul**.

  Il ne touche à aucun simulateur partagé.

## Lancer

```
node tests/ios-sim/banc.mjs --parcours zoom
VC_SESSION=<jeton QA> VC_PROJET=<id> node tests/ios-sim/banc.mjs --parcours zoom,clavier
```

Les artefacts vont dans `test-results/ios-sim/` : `rapport.json` et des
captures d'écran réelles de l'appareil, clavier compris.

## Contrôles positifs (le banc refuse de conclure sans eux)

- **zoom** — un témoin à 12 px `!important` DOIT faire zoomer Safari. Sinon :
  « BANC AVEUGLE ».
- **clavier** — la fenêtre visuelle DOIT perdre au moins 150 px au toucher.
  Sinon : « CLAVIER NON OUVERT ».

## Périmètre proposé (à valider par Avi avant toute bascule)

| # | Parcours | Ce que Chromium ne voit pas | Spec Chromium en regard |
|---|---|---|---|
| 1 | Zone de saisie de l'agent, clavier ouvert | fenêtre visuelle réduite par le clavier | `agent-composer-panel-viewport` |
| 2 | Zoom au focus de chaque champ (agent, connexion, IDE) | zoom réel de Safari | `ios-input-zoom`, `ios-zoom-floor-live` |
| 3 | Panneaux du composeur (menu ⋯, mode, « Avancé ») sous la barre de Safari | barre d'outils réelle | `agent-composer-panel-viewport` |
| 4 | Barre de navigation mobile et indicateur d'accueil | `env(safe-area-inset-bottom)` réel | `ui-details` |
| 5 | Révélation au toucher (actions d'un message) sans `:focus-within` | Safari ne focalise pas au toucher | `agent-message-density` |

Exécution locale et à la demande : la CI Linux n'a pas de simulateur iOS. Un
passage en CI demanderait un runner macOS.
