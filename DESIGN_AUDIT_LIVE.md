# DESIGN AUDIT LIVE

Un point ne passe dans la colonne « Testé live » qu'après vérification à l'écran, greps de contrôle et captures clair/sombre à 390, 768, 1024 et 1440 px.

| ID | Point | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve live |
|---|---|:---:|:---:|:---:|---|
| SOL-01 | App Builder | ✅ | ☐ | ☐ | Page et responsive validés localement (23/23 Playwright, 16 captures inspectées), mais validation globale maintenue ouverte : les captures IDE authentiques montrent encore le thème violet de la première génération et le run documenté utilise un adaptateur mémoire sans DB/auth/email externe. Attente de validation Avi. |
| SOL-01-IMG | Visuels de démonstration App Builder | ✅ | ☐ | ✅ | Historique technique conservé : les SVG passaient les contrôles, mais ne répondent pas au niveau de réalisme attendu. |
| SOL-01-IMG-REAL | Captures navigateur bilingues App Builder | ✅ | ☐ | ✅ | Vérifié à l’écran et par greps le 2026-07-13 : 8 PNG produit, 2 OG, interfaces et légendes localisées, sélecteur EN/FR persistant, `loading`/dimensions/alt, zéro ancien SVG ou domaine `salon-demo.ecode.app` ; 16 captures finales sans blanc ni header dupliqué. |
| SOL-01-IDE-PROOF | Preuve réelle prompt → agent → Preview | ✅ | ☐ | ✅ | Vérifié localement le 2026-07-14 : captures EN/FR issues de vrais workspaces E-Code, prompts exacts visibles, réponse Agent, 24 fichiers EN / 22 fichiers FR, app active dans Webview Preview, réparation réelle du routeur, exports indépendants typecheck+build verts. La page divulgue que ces runs n'ont ni DB/auth/email externe. Matrice page 23/23 et 16 captures responsive inspectées. |
| SOL-02 | Website Builder | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-03 | Game Builder | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-04 | Dashboard Builder | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-05 | Chatbot / AI Agent Builder | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-06 | Internal AI Builder | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-07 | Enterprise | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-08 | Startups | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-09 | Freelancers | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| TPL-02.1 | Gallery d'applications publiées/remixables `/dashboard/templates` | ✅ | ☐ | ☐ | À vérifier en clair/sombre, 390/768/1024/1440 px : cartes riches, recherche/filtres/tri, modération/signalement, aperçu fonctionnel et permissions de remix. |
| TPL-02.2 | Remix/Fork isolé avec provenance | ✅ | ☐ | ☐ | Source publiée → nouveau projectId/propriétaire/repo/workspace/locks ; aucun secret ; données isolées ; IDE/runtime/Preview/publish réels. |
| TPL-02.3 | Hub Import — 12 sources | ✅ | ☐ | ☐ | Chaque connecteur doit exposer validation, progression, récupération d'erreur, détections et aperçu avant création ; screenshot absent. |
| TPL-02.4 | Projet vide sans Agent/scaffold | ✅ | ☐ | ☐ | Voie power-user à vérifier réellement jusqu'à l'IDE. |
| TPL-02.5 | 6 starters historiques requalifiés en démos/fixtures | ✅ | ☐ | ☐ | Aucune carte de framework Python/Go/Rust ; scénarios de non-régression à exécuter. |
| TPL-02.PROOF | Prompt, import et remix publiables | ✅ | ☐ | ☐ | Trois vrais projets distincts → IDE → runtime → Preview → publish, avec captures. |
