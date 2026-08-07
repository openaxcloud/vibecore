# Attestation v6 — fail-closed sur mergedCommit / repoCommit / runUrl

**Verdict traité :** RR-20260723-CODEX-07 (refus de P0-LS-16, P0-LS-18, P0-V3-14).

## Défaut corrigé

Le vérificateur d'attestation v6 était **fail-OPEN** sur trois champs de
provenance : `checkAttestationFields` ne contrôlait `mergedCommit`, `repoCommit`
et `runUrl` que **s'ils existaient** (`if (att.X !== undefined && …)`), et
`validate-registries` ne les **exigeait pas**. Une attestation « amputée » (champ
supprimé) passait donc encore au vert, et les tests négatifs ne falsifiaient que
des valeurs présentes — jamais leur **suppression**.

## Correction (fail-closed aux deux étages)

1. **Vérificateur pur** (`scripts/parity/verify-attestation-run.mjs`,
   `checkAttestationFields`) — les 3 champs sont OBLIGATOIRES et NON VIDES ;
   `undefined` / `null` / chaîne vide sont rejetés explicitement
   (`isBlank`) avec un message `… ABSENT/vide — champ OBLIGATOIRE`.
2. **Validateur structurel** (`scripts/parity/validate-registries.mjs`, bloc 14)
   — même exigence : `mergedCommit` + `repoCommit` doivent matcher
   `^[0-9a-f]{7,40}$`, `runUrl` doit matcher une URL de run GitHub Actions.
   Bloc 12sexies : `repoCommit` ajouté au contrôle anti-fictif d'historique git.
3. **Tests négatifs indépendants par champ** — `verify-attestation-substitution-test.mjs`
   §3c : un test qui **supprime** chacun des 3 champs (un par champ) et exige
   l'échec, plus la variante chaîne vide.
4. **Message de succès corrigé** — n'affirme plus « liés » que lorsque les 3
   champs sont réellement présents (garanti par la garde).

## Artefacts (logs générés, hashés dans SHA256SUMS.txt)

| Fichier | Contenu | Exit |
|---|---|---|
| `01-substitution-test.txt` | tests négatifs par champ, dont §3c suppression | 0 |
| `02-repro-fail-closed.txt` | repro bout-en-bout : pur + structurel rejettent chaque amputation | 0 |
| `03-validate-registries-clean.txt` | validateur complet sur arbre propre → « all registries valid » | 0 |
| `00-guard-source-git-hashes.txt` | `git hash-object` des 4 fichiers de garde (traçabilité) | — |

> Extension `.txt` et non `.log` : la ligne 2 de `.gitignore` (`*.log`) exclurait
> silencieusement les logs du dépôt — les artefacts doivent être RÉELLEMENT
> committés et hashés, pas seulement référencés dans `SHA256SUMS.txt`.
> Logs capturés sur l'arbre rebasé (attestation courante de `main` :
> run `30081245711` @ `c1f29fd4`).

## Repro exécutable (déterministe, sans réseau)

```bash
mkdir -p /tmp/parity-deps && (cd /tmp/parity-deps && npm init -y >/dev/null && npm install yaml@2 >/dev/null)
PARITY_DEPS=/tmp/parity-deps node scripts/parity/verify-attestation-substitution-test.mjs   # tests négatifs, exit 0
PARITY_DEPS=/tmp/parity-deps node scripts/parity/repro-attestation-fail-closed.mjs           # bout-en-bout, exit 0
PARITY_DEPS=/tmp/parity-deps node scripts/parity/validate-registries.mjs                     # validateur, exit 0
```

Le repro pointe `validate-registries` (via `PARITY_ATTESTATION_PATH`) sur une
**copie amputée hors-arbre** de `CI_ATTESTATION.yaml` et prouve que retirer
n'importe lequel des 3 champs fait **échouer** le validateur.

## Roll post-merge

La garde a changé : un **nouveau** roll post-merge (nouveau run GitHub Actions
`parity-registries.yml` sur `main` + commit `parity-attestation-bot`) est produit
automatiquement au merge de la PR (job `roll-attestation`, `if: push` sur `main`).
URL du run + SHA du commit bot reportés à Avi une fois le merge effectué.
