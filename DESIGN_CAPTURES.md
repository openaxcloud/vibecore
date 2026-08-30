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
| [`accent-charte`](docs/audit/captures/accent-charte/) | L'accent d'action de l'IDE était **bleu** (`#0099ff`) alors que la marque est orange. Aplats et libellés remesurés. | light + dark | light + dark | #255 (non mergée) |
| [`cibles-tactiles`](docs/audit/captures/cibles-tactiles/) | Commandes de la coque commune à **36×36 px** — sous le plancher tactile de 44 px — à 390 et 768. | 390 + 768 | 390 + 768 | #257 (non mergée) |

## Points mesurés le 30/08 — chiffres établis, captures à faire

Ces points ont été **mesurés en réel sur la production** et corrigés. Les mesures
sont ci-dessous ; les images restent à prendre une fois les correctifs déployés,
pour que l'« après » montre l'état servi et non une prévisualisation locale.

| Sujet | Mesure AVANT | Attendu APRÈS | Livré par |
|---|---|---|---|
| **Accent d'action** — source unique | `--vc-action-primary` et `--vc-ide-accent-action` se définissaient l'un par l'autre ; le sens s'inversait selon la coque, d'où des boutons bleus au hasard | une seule source, orange de marque | #254 ✅ |
| **Bleu résiduel** | `item-contentAccent` (294 usages) et `item-backgroundAccent` (61) encore sur l'échelle `accent` = `#0099FF` — anneau de focus, chargements, barres de progression, icône de l'élément sélectionné | orange ; clair `#9a3412` (5,80:1 sur `#E5E5E5`), sombre `#f97316` (7,06 / 6,40 / 5,40:1) | #271 ✅ |
| **Console d'administration** | dernière surface bleue : `apps/admin` redéclarait `--vc-ide-accent-action: #0099ff` ; blanc sur l'aplat à **3,00:1** | orange `#f97316` (7,06:1) ; libellé `#0a0a0a` (6,82:1) | #254 ✅ |
| **Cibles tactiles — auth** | `/login` en 390 : **12 contrôles sous 44 px**, dont « Se connecter » à **42** | plancher 44 px en pixels, hors liens en ligne (WCAG 2.2 · 2.5.8) | #264 ✅ |
| **Cible mal nommée** | `/register` en 768 : « + Ajouter un nom d'organisation » **286×39**, exclu à tort par son nom de classe | inclus sur critère **structurel** (`inline-flex`) | #272 ✅ |
| **Modale de création** | 390 : « Fermer » **309×44** sur une ligne entière (87 % de la largeur) ; **5 couleurs saturées** pour 2 choix | croix ancrée ; l'accent réservé à l'option recommandée | #263 ✅ |

### La cause commune des cibles tactiles

`--vc-type-interface-size` **redéfinit la base rem** : `12px` en desktop, `14px`
sous 1024 px. Tout utilitaire Tailwind exprimé en rem est donc dégonflé :

| classe | écrit | desktop | mobile | attendu |
|---|---|---:|---:|---:|
| `h-12` | `3rem` | **36 px** | **42 px** | 48 |
| `min-h-11` | `2.75rem` | **33 px** | **38,5 px** | 44 |

Les **36×36** de la coque commune et le « **jeton 42 px** » ne sont pas deux
problèmes ni deux jetons : c'est `h-12` dégonflé à deux bases rem différentes.
La base **n'est pas touchée** — c'est la densité assumée de l'équipe
(`index.scss` : « never re-scale this base »). Les planchers tactiles sont donc
exprimés en **pixels**, seule unité que la base ne peut pas déformer.

## Relevés propres du 30/08 (aucun défaut trouvé)

Sonde à composition alpha correcte, avec un drapeau **`FIABLE`** — au moins 10
éléments mesurés **et** viewport > 0. Sans lui, un balayage à viewport nul
rendrait « 0 défaut » sur une page jamais regardée : le piège a été rencontré
pour de vrai sur `/enterprise`.

| Surface | Format | Thème | Éléments mesurés | Verdict |
|---|---|---|---:|---|
| `/` | 1440 | clair | 91 | propre |
| `/pricing` | 390 | clair | — | propre ; le tableau de comparaison (760 px) défile bien dans son conteneur |
| `/pricing` | 768 | sombre | — | propre |
| `/pricing` | 1440 | sombre | 221 (80 cibles) | propre |
| `/enterprise` | 1440 | clair | 95 | propre |
| `/login` | 390 | clair | — | propre au contraste ; 12 cibles sous 44 px → #264 |
| `/register` | 768 | clair | 16 | propre au contraste ; 12 cibles sous 44 px → #264 + #272 |

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
