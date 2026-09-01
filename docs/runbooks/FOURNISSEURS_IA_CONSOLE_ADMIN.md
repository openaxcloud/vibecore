# Fournisseurs d'IA dans la console d'administration

Demande d'Avi : que les quatre clés (Anthropic, xAI, Moonshot, Gemini) soient
présentes dans la console d'administration.

**Contrainte tenue : personne ne recopie une clé.** Ni Avi, ni une session.

---

## 1. Ce qui existe aujourd'hui — mesuré, pas supposé

| question | réponse mesurée |
|---|---|
| Une table en base pour les clés d'IA ? | **Non.** Aucun modèle Prisma. |
| Un secret Kubernetes ? | **Oui** — `vibecore-platform-secrets`, ns `vibecore`, 49 clés. |
| Des variables d'environnement ? | **Oui** — c'est la source réelle. |
| Une page d'administration pour ces clés ? | **Non.** Seule existe `/admin/oauth-providers`, qui gère les fournisseurs de *connexion*, pas d'IA. |

La résolution des identifiants (`app/lib/.server/llm/provider-credentials.ts`)
lit, dans l'ordre : une clé apportée par l'utilisateur via le cookie `apiKeys`,
puis l'`apiTokenKey` du fournisseur dans l'environnement du serveur.

| fournisseur | variable |
|---|---|
| Anthropic | `ANTHROPIC_API_KEY` |
| xAI | `XAI_API_KEY` |
| Moonshot | `MOONSHOT_API_KEY` |
| Google Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` |

## 2. Le défaut, et le branchement retenu

Demander une re-saisie serait un défaut de conception, pas une fonctionnalité :

* la valeur transiterait par un presse-papiers, un journal de navigateur, un
  transcript — exactement ce qui s'est produit le 2026-09-01 ;
* elle créerait une **seconde source de vérité**, qui divergerait de la première
  dès la première rotation.

**Branchement livré** : `GET /admin/providers/ai` lit la source existante et rend
l'état, par fournisseur — `provider`, `displayName`, `envVar`, `source`,
`configured`, `length`, `last4`, `tokenConsoleUrl`.

**Jamais la valeur.** Les quatre derniers caractères suffisent à reconnaître une
clé et à confirmer qu'une rotation a pris ; ils ne permettent pas de la
reconstituer. Sous 8 caractères, même cela n'est pas montré.

Il n'existe **aucun** `POST`/`PUT`/`PATCH` sur cette route : invariant tenu par
`services/api/src/admin-fournisseurs-ia.spec.ts`, pour qu'un champ de saisie ne
puisse pas réapparaître plus tard.

## 3. Enregistrement en base : non nécessaire

La source existe déjà et la console la lit. Aucune procédure de saisie à écrire.

Si un override par organisation devenait nécessaire, il devrait suivre le patron
**écriture seule** déjà en place pour les secrets OAuth : `type="password"`,
valeur jamais renvoyée au navigateur, champ vide = valeur conservée.

## 4. La console affiche-t-elle des clés en clair ? — Non

* `GET /admin/connectors/api-key` ne renvoie que `provider`, `displayName`,
  `authType`, `enabled`, `tokenConsoleUrl`, `configureEndpoint` — aucune valeur.
* Le formulaire OAuth utilise `type="password"`, le secret est écrit seulement,
  jamais relu vers le navigateur, et un champ vide conserve la valeur stockée.

**Aucun défaut de sécurité à consigner sur ce point.**

---

# Rotation des quatre clés — pour Avi

Procédure détaillée : [`ROTATION_CLES_LLM.md`](./ROTATION_CLES_LLM.md).

1. **Créer** les nouvelles clés dans les quatre consoles, sans toucher aux
   anciennes — les quatre fournisseurs acceptent plusieurs clés actives.
2. **Basculer** : patcher `vibecore-platform-secrets` **clé par clé**, valeur lue
   depuis un fichier pour qu'elle n'apparaisse ni à l'écran ni dans l'historique.
   Jamais `kubectl edit` — 49 clés dans ce secret.
3. **Redémarrer** les huit Deployments (`rollout restart`) : `envFrom` n'est lu
   qu'au démarrage du conteneur.
   ⚠️ **Ne pas passer par `helm upgrade`** — le secret est géré hors du chart et
   `--reuse-values` restaurerait les anciennes clés.
4. **Prouver** par une génération réelle avant toute révocation.
5. **Révoquer** les anciennes, seulement alors.

**La console sert de vérification à l'étape 4** : après le redémarrage, `last4`
doit avoir changé pour chaque clé tournée. C'est la démonstration qu'aucune
valeur n'a besoin d'être affichée pour être utile.
