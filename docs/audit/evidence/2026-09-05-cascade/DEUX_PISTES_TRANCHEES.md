# Deux pistes tranchées — 2026-09-05

## Piste 1 — `no-store` sur `/api/*` à l'ingress : le risque est réel

**La règle globale casserait sept routes.** Elles demandent délibérément à être
mises en cache :

| route | en-tête posé |
|---|---|
| `api.blog.posts`, `api.blog.posts.$slug`, `api.blog.featured`, `api.blog.categories.$category` | `public, max-age=300` |
| `api.payments.plans` | `public, max-age=300` |
| `api.projects.$projectId.homepage-preview` | `private, max-age=60` |
| `api.git-proxy.$` | relaie le `cache-control` de l'amont |

Sur 176 routes `api.*` : 28 posent un `Cache-Control`, dont **21 déjà en
`no-store`/`no-cache`**. Une règle « toujours poser » n'est donc pas
acceptable ; seule une règle **« poser si absent »** l'est.

### Pourquoi l'ingress ne convient pas

| constat | mesure |
|---|---|
| contrôleur | `ingress-nginx v1.15.1` |
| ConfigMap `ingress-nginx-controller` | **vide** — aucune clé |
| ingress utilisant un snippet aujourd'hui | **0 sur 2** |

Une règle conditionnelle en nginx demande `map` + `proxy_hide_header` +
`add_header`, c'est-à-dire un `configuration-snippet`. Depuis la 1.9,
`allow-snippet-annotations` vaut `false` par défaut, et le ConfigMap est vide :
il faudrait l'activer. Sur une plateforme multi-locataire, rouvrir l'injection
de configuration nginx par annotation coûte plus cher que le trou qu'on ferme.

La clé globale `add-headers` ne sauve pas la mise : elle **ajoute** un en-tête à
**toutes** les réponses, y compris aux assets `immutable` — deux `Cache-Control`
sur un asset, et le cache des assets tombe. Le remède serait pire que le mal.

### La couture applicative n'existe pas non plus

`json(` vient de **trois modules différents** (`~/lib/enterprise-api.server` 42,
`react-router` 20, `~/lib/json-response` 17) et **20 routes** construisent leur
`Response` à la main. React Router 7.18.0 n'expose aucun intergiciel (vérifié
avec témoin sur le fichier de types). Le serveur est le `react-router-serve`
d'origine, sans enveloppe.

### La seule voie propre — et c'est une décision, pas un correctif

Remplacer `react-router-serve` par une entrée serveur maison de quelques
dizaines de lignes qui monte le gestionnaire de requêtes et pose
`Cache-Control: no-store` sur `/api/*` **seulement si l'en-tête est absent**.

* **un seul endroit**, valable pour les 176 routes et pour toutes les futures ;
* **testable dans le dépôt**, contrairement à une règle d'ingress ;
* la condition « si absent » préserve les sept routes cachables.

Mais cela remplace le **point d'entrée du processus** de tout l'étage web.
Ça ne se fait pas au détour d'un correctif de cache.

---

## Piste 2 — `security` / `signup` / `mfa-setup` préchargés : c'est encore le nom

**Le chunk `upgrade` n'existe pas en production.** Il venait de
l'environnement de test. Sur `app.e-code.ai`, la page d'accueil précharge 36
assets, dont `security`, `signup`, `mfa-setup`, `account-settings._index`,
`organization-access`.

**Et ils ne contiennent pas les pages qu'ils nomment.** Chaînes extraites des
fichiers servis en production :

| chunk | poids | ce qu'il contient réellement |
|---|---:|---|
| `security-*` | 37,9 Kio | « A full dev environment in the cloud », « Accessibility at E-Code », « Access company information, media assets, and recent coverage » — **du marketing** |
| `signup-*` | 15,4 Kio | copie d'inscription **et** marketing |
| `mfa-setup-*` | 17,8 Kio | catalogue partagé : 834 chaînes, dont **89 applicatives contre 24 marketing** |

C'est l'artefact de nommage de l'entrée 29, à l'identique : Rollup nomme un
chunk d'après l'un de ses modules, et le nom ne dit rien de son contenu.

**Réponse aux deux questions posées :**

1. **Non, ce n'est pas un préchargement délibéré de pages d'espace
   utilisateur** — ce sont des catalogues de traduction partagés.
2. **La question de l'accès ne s'applique pas.** `/security` et `/signup`
   répondent d'ailleurs 200 en public ; `/mfa-setup` et `/account-settings`
   redirigent vers `/login` ; `/logs` rend 404. Mais aucune de ces pages n'est
   dans les chunks.

### Ce qui reste vrai, et sa taille

Le catalogue `mfa-setup` est massivement applicatif — « A project with these
settings already exists », « Automatic checkpoint before AI changes »,
« Bitbucket repository » — et la page d'accueil le télécharge sans jamais en
rendre une ligne. C'est un vrai gaspillage.

**Sa taille : ~17,8 Kio sur 1 235 Kio, soit 1,4 %.** Et le remède — découper les
catalogues i18n — est exactement celui qui a été mesuré ce matin : il a fait
passer la fermeture statique de 223 à **259** routes. Une régression.

**Verdict : défaut réel, à 1,4 %, dont le seul remède essayé aggrave le
problème. Non poursuivi.**
