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

---

## Parcours de création — mesure du 2026-08-31 sur la production

**Méthode.** Compte jetable, projet vide, `app.e-code.ai`, navigateur piloté, trafic
réseau enregistré. Vérification de l'état **côté serveur** par l'API, jamais depuis la
page : une sonde exécutée dans la page a rendu des `404` sur du HTML et aurait fait
conclure n'importe quoi. Compte supprimé après coup (`reste=0`).

| Point | Verdict |
|---|---|
| `BUG-CREATE-010` | **reproduit de bout en bout** — perte de données P0 |
| `BUG-CREATE-007` | **reproduit** — `400 WORKSPACE_AGENT_CLIENT_ERROR` sur un dossier |
| `BUG-CREATE-006` | **non concluant** — pas de 502, mais l'espace n'était pas réellement froid |

### Le piège de cette passe : mesurer par un chemin que l'utilisateur n'emprunte pas

Ma première reproduction de `BUG-CREATE-010` écrivait le fichier marqueur par l'API
runtime en direct. Le marqueur disparaissait — mais **cette écriture n'est pas celle
d'un utilisateur**, et conclure là-dessus aurait été un faux positif.

Il a fallu refaire le parcours par l'interface : ouvrir le fichier dans l'éditeur, taper,
**vérifier que la frappe est bien arrivée dans Monaco** (`CONTENU_EDITEUR` relu après la
saisie), puis `Ctrl+S`. C'est seulement là que la mesure vaut quelque chose — et elle a
montré que la sauvegarde n'émet qu'un `PUT …/ide-state`, que l'archive du projet ne bouge
pas, et que la réouverture depuis un appareil neuf réécrit le fichier depuis cette archive
périmée.

**Une frappe non vérifiée dans un éditeur est le même faux négatif qu'une page non
chargée** : la sonde produit un verdict sans avoir rien mesuré.

---

## Les faux négatifs rencontrés le 2026-08-31

Tous ont la même forme : **l'outil n'a rien mesuré et a rendu un résultat rassurant.**

| Sonde | Ce qui n'allait pas | Ce qu'elle rendait |
|---|---|---|
| balayage de contraste de l'IDE | `networkidle` ne se produit jamais (websocket, sondes, HMR) | **« 0 défaut »** sur une page jamais chargée |
| résolution de thème | la feuille compilée écrit `[data-theme=light]` **sans guillemets** | le thème SOMBRE mesuré deux fois, vert et faux |
| lecture d'une capture à l'œil | le blanc sur orange se lit comme du texte sombre | « avant et après sont identiques », alors que rien n'était appliqué |
| **capture de requêtes** | corps **tronqués à 4 000 octets** par la sonde | **« le marqueur n'est pas dans la charge »** — il était au-delà de la coupure. Les corps faisaient EXACTEMENT 4 000 o, ce qui aurait dû alerter |
| comptage de défauts | le fichier de test n'existait pas sur la branche | `grep \| wc -l` = **0**, indiscernable de « aucun défaut » |
| filtre de contrôles CI | le filtre ne matchait aucun contrôle | `,,` lu comme **« tout est vert »**, sur une PR dont la CI n'avait pas démarré |
| état des déploiements | 8/8 « Ready et à jour »… pour la révision **précédente** | « mon changement est déployé », alors que le build tournait. **Seule la révision Helm fait foi** |
| frappe dans l'éditeur | rien ne garantissait que la saisie avait atteint Monaco | un verdict de perte de données sur une frappe jamais arrivée |
| trace d'URL | l'hôte effacé du relevé | impossible de distinguer `app.` de `api.` — donc de savoir quel service traitait la requête |

**Règle qui en découle, appliquée partout depuis :** toute commande de comptage
doit distinguer « rien trouvé » de « rien exécuté », et toute sonde doit échouer
bruyamment quand elle n'a pas pu mesurer. Un champ d'erreur qu'il faut penser à
lire n'est pas une protection.
