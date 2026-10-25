# Diagnostic de l’historique des iframes

Le 25 octobre 2026, un scénario DOM isolé exécuté dans Chromium 154.0.8037.57 reproduit un retour arrière consommé par une iframe sans changement de l’URL ni événement `popstate` de la page principale. Il utilise une page interceptée `fixture.invalid`, un document HTML inerte et le sandbox de la prévisualisation statique. Aucun projet réel ni service externe n’est utilisé.

| Opération après l’ouverture de Déploiement | Longueur de l’historique | Après le deuxième Retour |
| --- | --- | --- |
| Réassigner `srcdoc` sur la même iframe, contenu différent | 3 → 4 | Déploiement, index principal 1 |
| Réassigner `srcdoc` sur la même iframe, contenu identique | 3 → 4 | Déploiement, index principal 1 |
| Créer une nouvelle iframe pour le document suivant | 3 → 3 | Prévisualisation, index principal 0 |

Chaque scénario ajoute ensuite la même entrée principale d’annulation avant les deux retours. Le premier retour atteint Déploiement index 1 ; dans les scénarios avec réassignation, le second concerne l’historique enfant. Le [standard HTML, navigation et historique](https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigation-and-session-history) décrit l’intégration des navigations enfants dans la liste d’historique commune au navigateur.

Le [script exact](iframe-history-probe.cjs) et le [reçu avec observations et empreinte](iframe-history-mechanism.json) conservent la provenance. Le script dépend des chemins de l’environnement de diagnostic. Son attente de navigation principale tolère un délai de 1 seconde pour relever l’état après une traversée limitée à l’iframe ; il ne remplace aucun test applicatif.

**Limite : ce mécanisme ne démontre pas la cause de l’échec CI.** La CI utilise Chromium 147. Les trois observations suivantes de l’application compilée à la révision `334` ont réussi et n’ont pas montré de réassignation tardive de `srcdoc`. Aucun correctif produit, assouplissement d’assertion ou exemption n’est déduit de ce seul scénario. L’observation des cadres dans la vraie CI reste nécessaire.
