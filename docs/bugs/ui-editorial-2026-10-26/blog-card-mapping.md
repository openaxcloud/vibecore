# Blog — cartes et contenu réellement disponible

`Blog.tsx:179` et`:225` donnent `/blog` aux sept liens « Lire la suite ». Clic du featured reproduit le retour à la liste dans4groupes ; le défaut de route enfant masquée est distinct et corrigé séparément.

| Carte existante | Donnée source | Correspondance publiée vérifiée |
| --- | --- | --- |
| Featured « Découvrez l’Agent E-Code… » | exactBlog.featured, date16juin2026 | Aucune équivalence exacte ; introducing-e-code parle de l’agent2.0, daté15janvier2026 |
| parallel-agents | exactBlog.articles.posts | Aucun slug correspondant |
| zero-config-deployments | idem | Aucun slug correspondant |
| effort-pricing | idem | Aucun slug correspondant |
| multiplayer-editing | idem | Aucun slug correspondant |
| agent-streaming | idem | Aucun slug correspondant |
| self-repair | idem | Aucun slug correspondant |

La liste vient de `marketing-exact-legal-blog.ts` et de BLOG_POST_META dans le composant. La source de détail `ecode-public-api-data.server.ts:207` ne contient que trois posts publiés : `introducing-e-code`, `building-at-scale-how-we-handle-10m-requests`, `getting-started-with-e-code-in-5-minutes`. Leurs corps FR/EN sont dans `marketing-blog-detail.ts`. Le détail lit vraiment cette source via findEcodeBlogPost ; un slug inconnu renvoie404.

Ne pas transformer arbitrairement six cartes en liens vers trois articles de sujets différents. Ne pas créer de corps d’article simulés, ni supprimer les cartes pour donner l’impression que le parcours est terminé. Un lot éditorial distinct doit choisir une source canonique, fournir/valider le contenu correspondant aux cartes existantes ou décider explicitement de leur statut, puis faire générer liste et destinations depuis cette source. Toute modification des catalogues partagés nécessitera coordination (notamment PR324 qui touche un test legal-blog).

Le correctif Outlet rend les trois articles existants accessibles à leur URL correcte ; il ne répare pas ces sept liens. Le test DataRouter emploie un lien fixture pour isoler le mécanisme de route et ne constitue pas une validation des liens réels du Blog.
