---
id: BUG-TOOLING-SHELL-QUOTE-001
---

## Bug

Le lockfile de main `0ca891a17ab8af30b545ede6f66d22271c283f59` résout `shell-quote@1.8.4` via la dépendance de développement racine `concurrently@8.2.2`. L’override `^1.8.4` laisse cette version verrouillée. L’avis officiel [GHSA-pqg4-j6r4-53mv / CVE-2026-102422](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) indique une plage affectée `>=1.8.4 <1.11.0` et une correction en `1.11.0` : `quote()` doit rejeter les terminateurs de ligne dans une chaîne après un jeton commentaire.

## 📤 Dispatché

☑ 12/10/2026 — lot local limité sur `security/shell-quote-20261012`.

## 💻 Codé

☐ — correction préparée localement ; ni poussée, ni PR, ni fusion sur main.

## ✅ Testé live

☐ — aucun déploiement ni contrôle production. Selon les inventaires transmis par le parent, les images servies à 13:05 ne contenaient pas ce paquet ; aucune exposition production n’est démontrée ici.

## Correction et portée

Override exact `1.11.0`, sans mise à jour de `concurrently` ni d’autre dépendance. Cette version respecte la plage `^1.8.1` déclarée dans le manifeste installé de concurrently 8.2.2 (compatibilité semver vérifiée). Version, intégrité SHA-512 et moteur Node vérifiés dans le [registre officiel npm](https://registry.npmjs.org/shell-quote/1.11.0). Le paquet exact a été installé par pnpm **9.14.4** dans une copie minimale isolée, sans scripts, depuis le registre officiel ; aucune dépendance d’exécution supplémentaire. L’entrée de lockfile produite par pnpm a été reportée dans le verrouillage existant. Le diff sémantique doit rester limité à l’override, l’entrée paquet, son snapshot et l’arête `concurrently → shell-quote` ; les importers restent identiques.

Les seuls usages directs de l’outillage dans le package racine sont `dev:all` et `electron:build:deps`. Dans `concurrently@8.2.2`, `ExpandArguments` utilise `quote()` pour les placeholders ; ces deux scripts statiques n’en contiennent pas. Leur compatibilité de parsing est vérifiée, sans lancement des serveurs ni du build Electron. Le lot ne démontre pas qu’un attaquant peut atteindre la condition vulnérable depuis ces scripts.

## Validations locales

- Avant modification : 324 dépendances directes conformes au lockfile ; TypeScript 5.8.3, Vite 5.4.21, Vitest 3.2.6, concurrently 8.2.2 et shell-quote 1.8.4 réellement résolus. Mémoire cgroup environ 8,7 Gio / 16 Gio.
- Installation exacte du seul nouveau paquet avec pnpm 9.14.4 et scripts désactivés. Première lecture de métadonnées bloquée par le cache npm non inscriptible, réussie avec un cache temporaire ; aucun refus réseau ni miroir utilisé.
- Lockfile complet accepté par pnpm 9.14.4 avec `--lockfile-only --offline --frozen-lockfile --ignore-scripts` et le store local explicite. Aucun module du workspace partagé n’a été remplacé.
- Sous-graphe concurrently installé séparément depuis le lockfile candidat : 29 paquets réutilisés hors ligne, aucune résolution nouvelle, `--frozen-lockfile --ignore-scripts`.
- Test `scripts/shell-quote-security.spec.mjs` : avec le paquet antérieur, quatre rejets attendus échouent et six contrôles de compatibilité passent ; avec 1.11.0, dix tests passent. Les quatre terminateurs (`LF`, `CR`, U+2028, U+2029), les arguments bénins, les deux scripts du dépôt et l’expansion de placeholders sont couverts.
- Trente gardes de l’inventaire et de sa migration passent ; Prettier, contrôle syntaxique du test et `git diff --check` passent. Le CLI concurrently isolé répond `8.2.2`. Le diff sémantique du lockfile a été comparé intégralement : aucun changement hors des quatre emplacements prévus, entrée du nouveau paquet identique à celle générée par pnpm.
- Les tests ne lancent aucun shell ou processus à partir des chaînes testées ; aucune exploitation exécutée. Les modules du workspace conservent volontairement 1.8.4 : le test y reste rouge tant que les dépendances ne sont pas restaurées depuis le nouveau lockfile. Le résultat vert porte sur l’installation isolée réelle de concurrently et sa nouvelle dépendance.

Ce lot concerne l’outillage uniquement. Aucun build applicatif, parcours authentifié, runtime distant, appel IA ou déploiement n’a été exécuté ; les autres entrées de l’audit restent hors portée.
