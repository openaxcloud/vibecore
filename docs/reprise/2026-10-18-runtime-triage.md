# Tri des 18 échecs runtime du 18 octobre

Relecture du journal à 19:13 UTC. **18 scénarios échoués, aucun réussi** sur
le SHA `3f6acb9cfb9d0b6647cea8fc8c0080fe5d55d7f9`. Le
[workflow nocturne](https://github.com/openaxcloud/vibecore/actions/runs/39097365302/job/117586475206)
reste vert parce que le job est déclaré `continue-on-error: true`.
Il sert une pile locale à `127.0.0.1:5173`, avec PostgreSQL, Redis, mailpit,
API et web. Il ne démarre ni workspace-manager, ni Pod, ni agent de workspace.
Ce résultat ne décrit pas la disponibilité actuelle des domaines de production.

Les [18 fiches et extraits d'échec](mesures/2026-10-18-runtime-failures-triage.json)
sont conservés avec la tête testée. Les chemins `app`, `tests/e2e` et ce
workflow n'ont pas changé entre cette tête et `1d2755086` : la comparaison de
code utilisée pour le tri porte bien sur les assertions exécutées. Les trois
tentatives d'un même scénario ne sont pas comptées comme trois scénarios.

| Groupe | Cas du journal | Constat et suite nécessaire |
| --- | --- | --- |
| Assertion obsolète vérifiée — 7 | 2, 4, 5, 13, 14, 16, 17 | Titre Templates ambigu ; lien d'état devenu bouton ; route canonique `/@organisation/projet` ; anciens sélecteurs de modèle absents ; dock Library au lieu de Files. Corriger les assertions en conservant leur exigence fonctionnelle, puis rejouer. |
| Runtime requis et absent du banc — 4 | 1, 11, 12, 15 | L'attente du bouton Workspace: running échoue avant la vérification de l'application. Provisionner un runtime QA autorisé et vérifier la santé de l'agent, les fichiers, le serveur et l'iframe. L'absence du runtime ne prouve pas à elle seule toutes les causes d'échec. |
| Parcours mobile non concluant — 5 | 6 à 10 | Selon la tentative : preview invisible au clic, URL restant `panel=agent`, ancien placeholder agent absent. Reproduire avec traces et captures ; séparer dérive d'assertion, course de navigation et défaut produit. |
| Interface à reproduire — 2 | 3, 18 | Palette ouverte sans bouton Deployments correspondant au helper ; onglet Terminal absent. Le journal seul ne suffit pas à attribuer ces deux défauts. |

Pour les sept assertions vérifiées, les contrats de code sont explicites :

- `dashboard_.templates.tsx` redirige avec `projectIdePath`, qui choisit la
  route canonique lorsque les deux slugs existent ; le journal montre cette
  route après création, pas une galerie publique.
- `BaseChat.tsx` rend le contrôle workspace avec `<button>` et le dock fichiers
  avec `data-testid="ide-dock-files"`. Son libellé anglais est `Library`.
- La recherche de `agent-provider-dropdown` et `agent-model-dropdown` dans
  `app` ne trouve plus ces identifiants attendus par le scénario IA.
- Le journal de Templates montre précisément un `h1` Templates et un `h2`
  Workspace templates, tous deux capturés par le nom partiel.

**Aucun de ces sept tests n'est déclaré réparé.** Une assertion corrigée ne
prouverait toujours pas le parcours complet sans runtime, génération réelle,
persistance et publication. Les onze autres cas restent non conclusifs sur la
cause produit ; plusieurs causes peuvent coexister.

La contre-revue indépendante du 18 octobre confirme les sept écarts de
contrat. Elle distingue également les étapes partielles déjà réussies : le
cas 5 écrit son état initial avant d'échouer ; le cas 17 a déjà replié puis
rouvert le panneau avant l'échec de la réouverture finale via le dock. Cela
ne transforme aucun des deux scénarios complets en réussite.

Les profils iPhone/iPad de ce run tournent dans Chromium. Ils ne constituent
aucune preuve Safari. Les captures n'ont pas été inspectées ici : le transfert
vers le workspace est refusé par le proxy. Aucun scénario n'a été relancé par
ce tri, aucun appel IA payant, paiement, runtime cloud ou donnée client n'a
été créé ou modifié.

Le prochain banc utile doit produire un verdict sur un compte QA neuf :
inscription et vérification d'adresse, génération réelle, démarrage conforme
au forfait, écriture puis réouverture des fichiers, publication et utilisation
de l'URL depuis une session extérieure. Chaque prérequis absent doit bloquer
le verdict et être nommé, sans devenir une réussite conditionnelle.
