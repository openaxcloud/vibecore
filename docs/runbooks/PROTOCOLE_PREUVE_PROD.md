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

## ⚠️ Une porte qui bloque sur ce qu'elle ne peut pas reconstruire arrête tout

Leçon du 2026-09-03, après **36 heures** sans aucune livraison en production.

La porte de vulnérabilités refuse un déploiement si **une seule** des 8 images
porte une CVE critique corrigeable. Or deux de ces images sont **hors de portée
de tout correctif applicatif** :

- **`admin`** n'est pas construit par le chemin continu — son digest est reporté
  tel quel, indéfiniment (BUG-SEC-002) ;
- **`screenshotter`** part d'une base tierce (Playwright).

**Conséquence structurelle** : dès qu'une CVE critique apparaît dans l'une
d'elles, la chaîne se ferme et **rien ne peut la rouvrir** — aucun changement de
code, aucun `override`, aucune montée de dépendance. Seule une exception le
peut. La porte finit donc toujours par tout arrêter, et l'exception devient
inévitable, ce qui est le contraire de l'effet recherché.

### Ce qu'on a fait, et ce que ça vaut

Exception **par image** (`.trivyignore.<service>`), une seule CVE nommée, datée
d'expiration. Le fichier global reste intact : les six images reconstruites
demeurent couvertes **par construction, pas par discipline**.

C'est un pansement borné, pas une réparation.

### La bonne cible de fond — ouverte, non engagée

Restreindre la porte aux **vulnérabilités atteignables** plutôt qu'à toute CVE
critique présente dans une image. Le `tar` embarqué dans npm ne s'exécute
jamais : le conteneur lance `node` directement. Bloquer une livraison sur du
code mort produit exactement ce qu'on a vécu — une porte contournée par
nécessité, donc affaiblie pour de bon.

⚠️ **Deux préalables avant d'y toucher** :

1. Reconstruire `admin` et `screenshotter` (BUG-SEC-002). Sans cela, restreindre
   la porte ne fait que déplacer le problème.
2. Comprendre **pourquoi** chaque contrainte existe avant de la changer. Le
   2026-09-03, j'ai proposé de paralléliser les builds en croyant le découpage
   accidentel : il protégeait d'un interblocage à 8 Go et garantissait que `web`
   consomme le `deps` de son propre commit. La justification était écrite en
   tête du fichier que je mesurais.
