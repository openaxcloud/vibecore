# Référence officielle — temps de premier contenu des panneaux IDE

**Toute campagne ultérieure se compare à CE relevé, avec CE même instrument des
deux côtés.** Mélanger deux instruments a déjà invalidé une comparaison entière
le 2026-09-04 ; c'est la raison d'être de ce document.

## Environnement du relevé (règle 11)

| | |
|---|---|
| Date | 2026-09-05 |
| Cible | **production**, `https://app.e-code.ai` |
| SHA servi | **`a00ccb761e`** — vérifié identique AVANT et APRÈS la campagne |
| Contenu déployé | #439 + #443 + #442 |
| Projet | **401 fichiers de source réelle**, importés par `files/import/zip` |
| Moteurs | Chromium 1440×900 · WebKit / iPhone 13 (390×664) |
| Espacement | 12 s entre chargements, **page neuve par panneau** |

## Instrument — et pourquoi celui-ci

`detect-content.mjs`. Le critère principal est la **présence de contenu**, pas
l'immobilité :

1. un **marqueur sémantique** connu du panneau, ou à défaut
2. un volume au-dessus du plancher de chargement (×2, et au moins +100) ;
3. puis, en condition **secondaire**, une longueur stable à 5 % près sur
   5 lectures.

Validé à chaque exécution par **deux témoins** : un panneau connu plein doit
être détecté, un panneau inexistant doit expirer. Sans ces deux témoins, aucun
chiffre n'est retenu.

## Les chiffres de référence

### Temps de premier contenu — `overview`, 3 relevés par moteur

| moteur | relevés | **médiane** |
|---|---|---:|
| Chromium 1440 | 9 069 / 9 634 / 11 049 ms | **9 634 ms** |
| WebKit / iPhone 13 | 7 457 / 8 808 / 10 492 ms | **8 808 ms** |

### Requêtes `/api/` au démarrage

**42 – 43** sur les deux moteurs. Ce compteur n'a jamais dépendu du détecteur :
il est donc comparable aux relevés antérieurs, qui donnaient **49 – 51** avant
#442. **Environ huit requêtes de moins par ouverture.**

### Passe complète, iPhone — 9 panneaux sur 9

| panneau | contenu à | panneau | contenu à |
|---|---:|---|---:|
| `logs` | 3 695 ms | `settings` | 5 278 ms |
| `env` | 4 414 ms | `integrations` | 8 749 ms |
| `extensions` | 4 638 ms | `overview` | 9 164 ms |
| `secrets` | 4 753 ms | `packages` | 9 177 ms |
| `collaborators` | 4 760 ms | | |

**0 erreur console, 0 débordement horizontal, 9/9 panneaux peuplés.**

## Ce que ce relevé n'est PAS

Ce n'est **pas un gain**. La référence antérieure (`be197c3e38`) a été prise
avec le détecteur défaillant, et ce SHA n'est plus servi nulle part : le
comparer reviendrait à mélanger deux instruments.

Redéployer l'ancien SHA pour obtenir un delta a été **explicitement écarté** :
remettre en production une version privée de tous les correctifs de la nuit
ferait courir un risque réel aux utilisateurs pour un bénéfice narratif.

Seul le compteur de requêtes autorise une comparaison, et elle est faite
ci-dessus.
