---
id: BUG-CREATE-005
---

## Bug

**P1 — l'import GitHub échoue au bout de 3 minutes sur un message générique.** `https://github.com/vitejs/vite-plugin-react` → `500` sur `/import-github.data` (`errorCode: importFailed`), UI : « Impossible d'importer le dépôt. Réessayez. » Cause réelle dans le journal API : `Workspace agent is unavailable: fetch failed: Connect Timeout Error (workspace-ws-….workspaces.svc.cluster.local:8080, timeout: 10000ms)`. L'utilisateur n'a aucun moyen de savoir que le problème n'est ni son URL ni son dépôt.

## 📤 Dispatché

☑

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

**Corrigé le 10/09 — et la cause inscrite ici était la mauvaise (règle 1).** J'ai d'abord corrigé le classement des échecs de `git clone` côté serveur : utile, mais ce n'était PAS le chemin emprunté. Le vrai, tracé de bout en bout : `apiRequest` (`app/lib/enterprise-api.server.ts`) impose `AbortSignal.timeout(30_000)` quand la route ne passe rien ; **les deux routes d'import ne passaient rien** ; le serveur, lui, laisse `git clone` tourner **120 s** (`services/api/src/project-storage.ts`). Le client raccrochait donc le premier sur tout dépôt un peu gros — et comme un abandon de `fetch` rend une `DOMException`, pas une `Response` (forme mesurée : `name: 'TimeoutError'`, `code: 23`), aucune branche `isApiResponse` ne l'attrapait : on tombait sur `actionError('importFailed', 500)`. Ce qui produit EXACTEMENT le symptôme relevé — `500` sur `/import-github.data`, `errorCode: importFailed`, « Réessayez. » ⚠️ **La ligne « Cause réelle » ci-dessus est à considérer comme non établie** : le `Workspace agent is unavailable` avait été rapproché de l'import sans correspondance d'identifiant de requête, et l'import ne touche pas l'agent (il écrit dans `projectStorage`). Correctif en trois parties : (1) budget client partagé `IMPORT_REQUEST_TIMEOUT_MS = 170 s` — au-dessus des 120 s du clone, sous les 180 s de `proxy-read-timeout` de l'ingress — posé sur l'import Git **et** l'import zip (règle 7, même mécanisme) ; (2) un abandon client devient « délai dépassé », plus « réessayez » ; (3) côté serveur, `classerEchecDImport` distingue dépôt inaccessible (404), hébergeur injoignable (502) et clone trop long (504), sur les DEUX routes d'import — sans jamais laisser sortir le `stderr` de `git`, qui peut porter une URL avec jeton (règle 12). épinglé par `app/lib/import-delai.spec.ts` (garde statique : les deux routes posent bien le budget), `app/routes/import-github.action.spec.ts` (l'abandon ne se déguise plus en « Réessayez »), `services/api/src/import-echec.spec.ts` (classement + garde : un seul appel à `importRepository`, enveloppé). Quatre contre-épreuves rouges dans les deux sens. ⚠️ **Testé live reste ☐** : production injoignable depuis cette session (403).

