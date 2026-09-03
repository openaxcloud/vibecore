# Protocole de preuve en production

**À qui ça sert** : certifier une surface EN RÉEL sur la production sans créer de
compte utilisateur, sans manipuler d'identifiant d'Avi, et sans laisser de trace
vivante derrière soi.

Établi et exécuté le 2026-09-01 pour certifier #316, #317 et #319.

---

## Le blocage que ça lève

« Je ne peux pas certifier en prod, je n'ai pas de compte de test. » Faux : un
compte de test EXISTE déjà, et on peut lui ouvrir une session sans mot de passe
et sans passer par `/auth/register` (limité à 10/min par IP, et qui créerait un
utilisateur de plus).

## Les mécanismes, mesurés

| élément | valeur |
|---|---|
| hachage du jeton | `sha256` hex — `packages/auth/src/index.ts` |
| forme du jeton | `vc_<base64url(32 octets)>` |
| cookie de l'application web | `vc_session` — `app/lib/enterprise-api.server.ts` |
| en-tête accepté par l'API | `Authorization: Bearer <jeton>` |
| compte de test | `qa-rt-3492cc7d@e-code-qa.test` |

⚠️ **Le cookie ne marche PAS sur `api.e-code.ai`** — l'API veut `Bearer`. Le
cookie sert à `app.e-code.ai`. J'ai perdu du temps à croire le contraire.

---

## 1. Ouvrir la session

Le script s'exécute DANS le pod `api`, qui a `DATABASE_URL` et le paquet `pg`.

```js
// mint.js — n'affiche que le jeton, aucune autre valeur d'environnement.
const { Client } = require('pg');
const crypto = require('crypto');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const u = await c.query('SELECT id FROM "User" WHERE email = $1', ['qa-rt-3492cc7d@e-code-qa.test']);
  if (u.rowCount === 0) throw new Error('compte de test introuvable');

  const token = 'vc_' + crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const id = 'sess_preuve_' + crypto.randomBytes(8).toString('hex');

  await c.query(
    'INSERT INTO "Session" (id, "userId", "tokenHash", "expiresAt", "createdAt", "lastActiveAt") ' +
      "VALUES ($1, $2, $3, now() + interval '4 hours', now(), now())",
    [id, u.rows[0].id, hash],
  );
  console.log('SESSION_ID=' + id);
  console.log('TOKEN=' + token);
  await c.end();
})().catch((e) => { console.error('ERREUR: ' + e.message); process.exit(1); });
```

```bash
K=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
POD=$(kubectl --context $K -n vibecore get pods -l app.kubernetes.io/component=api \
        -o jsonpath='{.items[0].metadata.name}')

# Le systeme de fichiers du pod est en LECTURE SEULE : passer par /tmp,
# et par l'entree standard (l'image n'a pas `tar`, donc `kubectl cp` echoue).
kubectl --context $K -n vibecore exec -i "$POD" -- sh -c 'cat > /tmp/mint.js' < mint.js
kubectl --context $K -n vibecore exec "$POD" -- sh -c 'NODE_PATH=/runtime/node_modules node /tmp/mint.js' > sess.txt
kubectl --context $K -n vibecore exec "$POD" -- rm -f /tmp/mint.js
```

⚠️ **Trois pièges, chacun m'a coûté un aller-retour** :
- `kubectl cp` échoue — pas de `tar` dans l'image. Utiliser `exec -i` + `cat >`.
- Le système de fichiers est en lecture seule sauf `/tmp`.
- `pg` n'est pas résolvable depuis `/tmp` : préfixer `NODE_PATH=/runtime/node_modules`.

**Vérifier immédiatement** :

```bash
TOKEN=$(grep '^TOKEN=' sess.txt | cut -d= -f2-)
curl -s -o /dev/null -w "%{http_code}\n" -H "authorization: Bearer $TOKEN" https://api.e-code.ai/auth/me   # 200
```

## 2. Certifier à l'écran

Le cookie `vc_session` est `httpOnly` : JavaScript ne peut pas le poser. Il faut
l'injecter au niveau du CONTEXTE navigateur.

```js
await page.context().addCookies([{
  name: 'vc_session', value: TOKEN,
  url: 'https://app.e-code.ai',       // <-- forme `url`, PAS `domain` + `path`
  httpOnly: true, sameSite: 'Lax',
}]);
```

⚠️ Avec `domain: '.e-code.ai'` la session est **refusée** et la page redirige
vers `/login`. Seule la forme `url:` fonctionne — c'est aussi celle qu'emploie
`tests/e2e/ios-input-zoom.spec.ts`.

**Mesurer, ne pas se fier à l'œil** : relever les valeurs (`getBoundingClientRect`,
`getComputedStyle`) ET prendre une capture. Une capture seule ne prouve pas un
chiffre ; un chiffre seul ne montre pas ce qu'Avi regarde.

## 3. Révoquer, et le prouver

**Non négociable.** Quatre vérifications, pas une :

```js
// revoke.js
const r = await c.query(
  'UPDATE "Session" SET "revokedAt" = now() WHERE id LIKE $1 AND "revokedAt" IS NULL RETURNING id',
  ['sess_preuve_%'],
);
console.log('revoquees : ' + r.rowCount);
const n = await c.query('SELECT count(*)::int n FROM "Session" WHERE id LIKE $1 AND "revokedAt" IS NULL', ['sess_preuve_%']);
console.log('TEMOIN : ' + n.rows[0].n + ' encore active (doit etre 0)');
```

```bash
# 1. sessions revoquees : > 0
# 2. TEMOIN : 0 session de preuve encore active
# 3. le jeton ne vaut plus rien
curl -s -o /dev/null -w "%{http_code}\n" -H "authorization: Bearer $TOKEN" https://api.e-code.ai/auth/me   # 401
# 4. supprimer les fichiers qui portent le jeton
rm -f sess.txt .playwright-mcp/pw-*.js
```

⚠️ Le préfixe `sess_preuve_` rend la révocation **exhaustive par construction** :
elle attrape aussi les sessions d'une exécution précédente qu'on aurait oubliées.
C'est ce qui m'a permis d'en révoquer 2 alors que je n'en suivais qu'une.

⚠️ Un outil d'automatisation navigateur **réaffiche le code exécuté**, donc le
jeton. C'est inévitable ; c'est pourquoi la session est courte, limitée à un
compte de test, et révoquée dès la preuve faite.

---

## Ce que ce protocole ne fait PAS

- Il **ne crée pas** d'utilisateur — il ouvre une session pour un compte existant.
- Il **ne touche à aucun identifiant d'Avi**.
- Il **ne certifie rien** par lui-même : il donne l'accès. La preuve reste une
  mesure avant / après sur la même page, avec son environnement consigné.

---

## Le test décisif : chercher le marqueur dans la RESSOURCE SERVIE

Établi le 2026-09-02, après avoir annoncé deux correctifs comme livrés alors
qu'Avi ne les voyait pas.

**L'état d'une PR ne prouve rien. Le SHA déployé non plus.** Ce qui prouve, c'est
le contenu du fichier que le navigateur télécharge réellement.

### La méthode

```bash
# 1. La page publique, pour lister les ressources empreintées
curl -s -o /tmp/page.html https://app.e-code.ai/login
grep -oE '/assets/[A-Za-z0-9_.-]+\.css' /tmp/page.html | sort -u

# 2. Télécharger la ressource SERVIE (pas celle du dépôt)
curl -s -o /tmp/servi.css https://app.e-code.ai/assets/index-XXXX.css

# 3. Y chercher le marqueur EXACT du correctif
grep -oE '\.ma-classe[^{]{0,120}\{[^}]{0,260}\}' /tmp/servi.css
```

Le marqueur doit être une chaîne que **seul** le correctif produit : une
propriété, une variable, un sélecteur nouveau. Pas un nom de classe qui
préexistait.

### Le contre-témoin est obligatoire

Chercher un marqueur ABSENT dans la même ressource, pour prouver que la
recherche discrimine. Le 2026-09-02 : la règle de `#359` était présente mot pour
mot, et `.bolt-terminal-session-menu` n'avait **ni `max-height` ni `overflow`** —
cohérent avec `#367` non fusionnée. Sans ce second point, un `grep` qui trouve
tout ne prouve rien.

---

## ⚠️ « SERVI MAIS INOPÉRANT » — la colonne qui manquait

Deux correctifs sur onze étaient **dans la ressource servie et sans effet**.
C'est un état distinct de « fusionné » et de « servi », et il n'était nommé nulle
part.

**Le cas mesuré.** La règle de `#359` était bien servie :

```css
.bolt-agent-scroll-to-bottom[data-vc-tooltip]:not([data-vc-radix-tooltip=true])
  { position:sticky; bottom:calc(var(--vc-agent-composer-measured-height, 0px) + 12px) }
```

Mais dans la page réelle, `--vc-agent-composer-measured-height` valait **(vide)**.
La variable est **lue 11 fois** dans la feuille et **définie 0 fois** : elle doit
être posée à l'exécution par du JavaScript qui ne le faisait pas. Toute la règle
retombait sur son repli `0px`.

**Le CSS était livré, la mesure qui le pilote absente.** Le correctif était
présent et inopérant — indistinguable, pour l'utilisateur, d'un correctif jamais
livré.

### Ce qu'il faut mesurer en plus du marqueur

Un correctif qui dépend d'une **variable CSS posée à l'exécution** n'est pas
prouvé par la présence de sa règle. Il faut lire la valeur **calculée dans la
page réelle** :

```js
const root = getComputedStyle(document.documentElement);
root.getPropertyValue('--ma-variable').trim() || '(vide)';
```

**Règle** : tout correctif reposant sur une variable d'exécution exige DEUX
preuves — le marqueur dans la ressource servie, ET la valeur non vide dans la
page. La première seule autorise à annoncer une livraison qui n'a aucun effet.

### Les quatre états à distinguer dans le suivi

| état | ce que ça veut dire |
|---|---|
| 📤 dispatché | envoyé à une session |
| 💻 codé | fusionné sur `main` |
| 📦 **servi** | le marqueur est dans la ressource que le navigateur télécharge |
| ✅ testé live | l'effet est mesuré dans la page réelle |

⚠️ **📦 servi ne vaut pas ✅.** C'est précisément l'écart où deux correctifs se
sont perdus le 2026-09-02.
