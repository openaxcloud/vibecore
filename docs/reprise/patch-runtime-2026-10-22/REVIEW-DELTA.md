# Delta de revue : package.json toujours strict

Parent de ce delta : `560af3a23ead73ceb541052e31975f14d6d838b5`. Base inchangée : `18745bd04f77e4d9fc6353d61bd4d17a3822f94e`.

- `isJsoncFile` exclut désormais tout basename `package.json` avant les exceptions de chemin JSONC. Le sanitizer et la validation de proposition utilisent ce prédicat partagé.
- Six assertions nouvelles reproduisent le défaut avant correction : reconnaissance JSONC et rejet par le sanitizer, avec chemins `.vscode/package.json`, imbriqués et Windows. Le JSON strict valide reste accepté ; les autres configurations JSONC restent couvertes.
- Le commentaire de `#maybeRunDeferredStart` décrit maintenant le comportement réel : une proposition échouée bloque jusqu’à acceptation réussie ou rejet explicite. Aucun changement de comportement du démarrage dans ce delta.
- Aucun changement API, runtime-remote, retries, workflow, dépendance ou exclusion de test.

## Validation ciblée

- Avant correction : 6 tests échoués, 23 passés dans les deux fichiers de régression.
- Après correction et formatage : **66 tests passent dans 5 fichiers**, incluant le vrai agent local avec lecture disque, les tests JSONC/pipeline et les scénarios de reprise/démarrage.
- Commande : `pnpm exec vitest run app/utils/jsonc.spec.ts app/lib/stores/jsonc-patch-pipeline.spec.ts app/lib/runtime/agent-file-write.integration.spec.ts app/lib/stores/devstart-differe.spec.ts app/lib/stores/workbench.reloaded-actions.spec.ts --maxWorkers=2 --no-file-parallelism`.
- Les hooks de commit exécutent le typage complet et le lint. Les résultats globaux de `RECOVERY.md`, `recovery-manifest.json` et de la description antérieure concernent la tête parent ; ils ne sont pas présentés comme une exécution complète de ce delta. La nouvelle CI et la revue du delta restent requises.

## Empreintes expurgées

| Élément | SHA256 |
| --- | --- |
| `app/utils/jsonc.ts` | `84e4bf44e788bc1a34b82febea77c9bac9d156312dc232d7cf5895419deaa959` |
| `app/utils/jsonc.spec.ts` | `d19d27825b2c9e8c96507728f50794f5286b3ac526e3233cab3953cd03f30b9b` |
| `app/lib/stores/jsonc-patch-pipeline.spec.ts` | `257e66da91de41067cbe821ebb731cdca438e0d8b6d04900dcdeafd14b2a3ae4` |
| `app/lib/stores/workbench.ts` | `56cc391023efe2cd2394a414025b6d9b7b5bd6eb06cb9802c4dba56fc0ce9515` |
| Journal local `red.log` | `db501cbba3f6e19aba5d64de657746d1d43b9141a6e919611fb707456d055148` |
| Journal local `green-final.log` | `ae1b30253ffab8e26240f24ec4fc8103183971138d8550b4a488bba2475a3f43` |
