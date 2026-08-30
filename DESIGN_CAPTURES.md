# DESIGN CAPTURES — bibliothèque avant/après

Bibliothèque de captures **clair et sombre** de chaque page et de chaque panneau.
Elle sert à voir, sans relire une ligne de code, à quoi ressemble l'écran
aujourd'hui et à quoi il ressemblait avant le correctif.

## Règle de tenue

- **Une entrée par point de design ou de bug**, pas une par capture.
- Chaque entrée porte **au moins un avant et un après**, dans les **deux thèmes**
  quand le point touche la couleur, et aux **trois formats** (390 / 768 / web)
  quand il touche la mise en page.
- **Quand un point est corrigé, l'image « après » REMPLACE l'ancienne** — on ne
  laisse pas deux « après » se contredire. L'image « avant » reste : c'est la
  preuve que le défaut existait.
- Les fichiers vivent sous `docs/audit/captures/<sujet>/`, avec un `README.md`
  par sujet qui dit ce qu'on regarde et quelle mesure a été prise.
- Une entrée n'est **complète** que si l'après a été capturé **en réel** (pas un
  rendu de test), sur la surface la plus défavorable du thème concerné.

## Nommage

```
docs/audit/captures/<sujet>/<sujet>-avant-<variante>.png
docs/audit/captures/<sujet>/<sujet>-apres-<variante>.png
```

`<variante>` = `light` / `dark` pour la couleur, `390` / `768` / `web` pour la
mise en page. Un point qui touche les deux porte les deux axes : `apres-390-dark`.

## Index

| Sujet | Ce qu'on regarde | Avant | Après | Livré par |
|---|---|:---:|:---:|---|
| [`accent-charte`](docs/audit/captures/accent-charte/) | L'accent d'action de l'IDE était **bleu** (`#0099ff`) alors que la marque est orange. Aplats et libellés remesurés. | light + dark | light + dark | #255 |
| [`cibles-tactiles`](docs/audit/captures/cibles-tactiles/) | Commandes de la coque commune à **36×36 px** — sous le plancher tactile de 44 px — à 390 et 768. | 390 + 768 | 390 + 768 | #257 |

## Manque encore

Les surfaces ci-dessous n'ont **aucune capture** à ce jour. Elles sont listées
pour que le trou soit visible, pas pour laisser croire qu'elles sont vérifiées.

| Surface | Thèmes | Formats |
|---|---|---|
| Tableau de bord (`/dashboard`) | clair + sombre | 390 / 768 / web |
| Éditeur de projet — panneau Fichiers | clair + sombre | 390 / 768 / web |
| Éditeur de projet — panneau Agent | clair + sombre | 390 / 768 / web |
| Éditeur de projet — Terminal et Ports | clair + sombre | 390 / 768 / web |
| Aperçu (Webview) | clair + sombre | 390 / 768 / web |
| Base de données | clair + sombre | 390 / 768 / web |
| Git | clair + sombre | 390 / 768 / web |
| Déploiements et domaines | clair + sombre | 390 / 768 / web |
| Journaux d'audit | clair + sombre | 390 / 768 / web |
| Facturation et `/upgrade` | clair + sombre | 390 / 768 / web |
| Réglages (tous les onglets) | clair + sombre | 390 / 768 / web |
| Pages marketing publiques | clair + sombre | 390 / 768 / web |
