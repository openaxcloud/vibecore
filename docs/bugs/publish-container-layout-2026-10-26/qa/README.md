# Publish : largeur du panneau, Domaines et Manage

Sur le build final, 12 scénarios qualifiés sont verts : huit cas à viewport de 2560 px (conteneurs320/390/600/820/1120/1200 avec historique, plus390/1120 sans historique), un cas exact à viewport de 2048 px, deux cas au zoom natif Chromium200 % (320/1120), et un contrôle sombre à 2048 px. Chaque cas parcourt Overview, Logs, Domains et Manage, avec formulaire avancé, saisie sans soumission et navigation Tab.

À2048 px, Agent 480 px + Library 380 px + le chrome IDE laissent **1089 px** au contenu Publish. Forcer1120 px dans ce viewport créait un débordement du harnais ; le reçu garde cette tentative et le contrôle final mesure la largeur disponible réelle, la largeur de page et l’absence de recouvrement par les panneaux latéraux. Les six largeurs demandées sont mesurées séparément à viewport de 2560 px.

## Preuve du défaut et du correctif

L’image `before-grid-ablation-domains-2048.png` remet uniquement l’ancienne règle à deux colonnes sur le vrai DOM, avec les autres styles et données identiques. Elle reproduit le grand vide et la vue à droite : contenu y113 alors que la navigation finit à145. Il s’agit d’une **ablation CSS causale**, pas d’une exécution complète d’un ancien build. `after-domains-2048.png` montre la règle finale sur la même configuration disponible.

Les contrôles mesurent les coordonnées des enfants, des boutons/champs/titres, les largeurs internes et les lignes DNS. Le domaine synthétique contient deux labels de 63 caractères ; le TXT est long et explicitement synthétique. Les valeurs ne reposent pas sur un tooltip tronqué : elles se replient et leurs scrollWidth ne dépassent pas leurs clientWidth. Les actions au clavier vérifient la cible active visible et non occultée via elementFromPoint. Le défilement automatique permet d’atteindre les champs dans les vues longues.

## Provenance et limites

API/PostgreSQL locaux pour création de fixtures et état du shell ; réponses GET contrôlées pour domaines et historique de déploiement. Toutes les mutations navigateur sont bloquées ; seules les sauvegardes IDE automatiques tentées sont relevées, aucune mutation DNS/Publish. Aucun domaine vérifié ou publié, aucune exécution fournisseur, donnée client ou ressource payante.

Manage présente l’état réel de détection indisponible du workspace isolé, avec Publish désactivé. Les fixtures d’historique sont synthétiques : ces tests valident disposition, lecture et saisie, pas une publication fonctionnelle. Les captures locales n’ont pas été comparées pixel à pixel aux captures client, dont le téléchargement était indisponible.

Un premier build candidat a fini alors que la réserve sur les longs domaines était corrigée ; sa source n’était pas gelée et il n’est pas utilisé comme reçu final. Le second build exact est réussi, sans changement des sources pendant compilation. Les échecs de préparation sont conservés hors dépôt : cible cachée ambiguë, remount avant mesure, sauvegardes IDE bloquées, et transition de redimensionnement. Les 8 cas à 2560 px et 2 cas de zoom passent à leur premier essai final ; les deux cas2048 sont qualifiés après correction du harnais. Zéro retry automatique ne signifie donc pas 12 scénarios verts au premier essai.

`receipt.json` contient les hashes des preuves brutes locales, `behavior.json` les mesures expurgées et `source-hashes.json` les sources mesurées. Traces, sessions, tokens et journaux serveur restent hors dépôt. Aucune validation de production ni Safari matériel revendiquée.
