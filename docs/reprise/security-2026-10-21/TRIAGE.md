# Audit des dépendances — 21 octobre 2026

Base : `6eb4bf42951057a6aa98e195a05e97211744964f`. Branche isolée ; aucune
modification des branches UI, des protections ou des exclusions de scan.

## Résultats et périmètres

L'audit pnpm 9.14.4 reproduit sur cette base 259 constats : 4 critical, 98 high,
129 moderate et 28 low. Le détail des advisories, versions et chemins est dans
`audit-baseline-summary.json`. Le compteur n'est pas une preuve d'exploitation.
Un audit supplémentaire `--prod` sur les manifestes et le lockfile de la base
rapporte 2 critical (Capacitor uniquement), 73 high, 110 moderate et 28 low.
Il confirme la séparation de Tinypool dev/CI, sans certifier le contenu des
images effectivement déployées.

Le champ agrégé `devDependencies: 0` de la réponse d'audit ne permet pas de
classer ces dépendances comme toutes présentes en production.

Le [run #760](https://github.com/openaxcloud/vibecore/actions/runs/39628990580/job/119321725379)
porte sur une autre tête, `14a28b88`. Le
[scan de main](https://github.com/openaxcloud/vibecore/actions/runs/39629824073/job/119324740506)
reproduit le même compteur avec un audit exit 1 rendu consultatif par
`continue-on-error`. Production CI rend également son audit consultatif.
Le gate images analyse les digests exacts : CRITICAL corrigibles bloquants,
HIGH consultatifs, `--ignore-unfixed` existant. Aucun identifiant actif trouvé
dans les neuf `.trivyignore*`. Aucun de ces réglages n'est modifié ici.

## Quatre critiques

| Dépendance                     | Usage constaté                                                                   | Correction et limite                                                                                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacitor Android et iOS 8.3.1 | Dépendances de production du shell natif mobile, deux constats pour un même avis | Android/iOS/core/CLI alignés, lockfile 8.5.3 ; projets Gradle/SPM régénérés. Rebuild et redistribution natifs nécessaires. Aucun binaire distribué ni appareil testé.                                                           |
| Tinypool 1.1.1, deux avis      | Transitif de Vitest, outillage dev/CI ; pas d'import serveur applicatif trouvé   | Override 2.1.2, Node 22 en CI. Deux régressions avec vrais workers et précondition de pollution du prototype contrôlée dans un processus isolé. Ce n'est pas une preuve d'une primitive de pollution exploitable dans Vibecore. |

Sources primaires :

- [Capacitor GHSA-rvm3-566m-v7fv](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv) : correctifs 8.4.3/8.5.1 annoncés ; le champ npm « patched <0.0.0 » est insuffisant. Désactiver CapacitorHttp ne suffit pas. Aucun blocage natif spécifique du proxy trouvé dans la base.
- [Tinypool options worker](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) : correctif 2.1.1.
- [Tinypool options run](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) : correctif 2.1.2.
- [Tinypool 2.0](https://github.com/tinylibs/tinypool/releases/tag/v2.0.0) : abandon de Node 18 ; CI du dépôt sur Node 22.

La déclaration racine `engines.node >=18.18.0` ne constitue pas une preuve de
compatibilité Node 18 : Tinypool 2 ne la conserve pas. Ce candidat est validé
localement sur Node 24 et doit passer la CI Node 22 ; aucune validation Node 18
n'est revendiquée.

Le candidat rapporte 0 critical, 98 high, 130 moderate et 28 low. La moderate
supplémentaire est un chemin `@capacitor/cli > xcode > uuid@7.0.3` vers
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
L'usage Xcode examiné appelle `uuid.v4()` ; l'avis concerne les buffers de
`v3/v5/v6`. Ce chemin est conservé dans le bilan, sans exemption de scanner.

## High à traiter ensuite

| Paquet            | Exposition constatée sur la base                                                                                                                    | Cible à valider dans un lot suivant                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ws 8.18.0/8.20.0  | WebSockets API, workspace-agent et preview ; autorisations existantes. Le maxPayload ne prouve pas une protection contre tous les petits fragments. | 8.21.0, [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)                                                                                                                         |
| compression 1.8.1 | `server.mjs` de production applique compression ; précondition décrite : déconnexion pendant compression.                                           | 1.8.2, [GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95)                                                                                                                          |
| MCP SDK 1.29.0    | Client HTTP avec headers configurables ; serveur, taskStore et OAuth non trouvés dans les usages examinés.                                          | 1.32.0 ; fuite de headers par redirection pertinente, [GHSA-6prh-2h8m-c8cw](https://github.com/advisories/GHSA-6prh-2h8m-c8cw). Les trois high serveur/OAuth n'ont pas de chemin exploitable établi ici. |
| Fastify 5.8.5     | Sept services ; préconditions des quatre high non retrouvées dans les schémas et handlers examinés.                                                 | 5.12.5 couvre aussi la moderate HTTP/2 ; validation serveur nécessaire.                                                                                                                                  |
| Hono 4.12.18      | Transitif MCP/Prisma dev ; aucun usage applicatif CORS dangereux trouvé.                                                                            | 4.13.11 à valider, sans conclure à une exploitation actuelle.                                                                                                                                            |
| undici 6.25.0     | Transitif npm ; usage `globalThis.WebSocket` aussi présent.                                                                                         | 6.28.1 pour npm ; version intégrée à Node à vérifier séparément dans les images.                                                                                                                         |

## Recette

Les preuves distinguent l'audit du lockfile, le comportement réel des workers,
les tests existants et les builds. Aucun faux fournisseur ou worker simulé.
`scripts/tinypool-security.spec.mjs` exécute le banc réel dans la suite Vitest
normale ; il échoue si le sous-processus échoue. Aucun saut opt-in.

La synchronisation Capacitor réussie sous Linux n'est pas une compilation iOS.
Le workflow Mobile Release existant peut construire Android debug sur une
branche sans signer ni publier en store ; sa tâche iOS vérifie seulement la
synchronisation et produit la documentation de signature. Aucune recette
appareil ni redistribution n'est revendiquée par ce lot.

Résultats locaux : 9 867 succès, 2 échecs et 7 sauts au passage global ; les
deux échecs venaient de sous-processus appelant le pnpm global 11. Les deux
fichiers ont ensuite passé 13/13 avec pnpm 9.14.4 et le store installé, sans
modifier leurs tests. Ne pas additionner ces compteurs qui se recouvrent.
Le typecheck a passé ses cinq sections initiales ; la section workspace a
également passé après la même correction de PATH. Les journaux initiaux et les
reprises sont conservés dans le reçu. Mobile : 29/29, typecheck, build web,
validation des assets et synchronisation Gradle/SPM réussis.
