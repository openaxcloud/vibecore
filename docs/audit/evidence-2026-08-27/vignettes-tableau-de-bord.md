# Vignettes des cartes de projet — relevé du 2026-08-27 (production)

Compte : celui d'Avi, `https://app.e-code.ai/dashboard`, 6 projets visibles.

## Repro (console du navigateur, session authentifiée)

```js
// 1) etat des <img> de vignette rendus par la page
[...document.querySelectorAll('img')].filter(i=>/thumbnail/.test(i.src))
  .map(i=>({id:i.src.match(/projects\/([^/]+)\//)[1].slice(-8),
            complete:i.complete, nw:i.naturalWidth, loading:i.loading}));

// 2) statut HTTP reel de chaque vignette
for (const id of ids) {
  const r = await fetch(`/api/projects/${id}/thumbnail`, {headers:{accept:'image/*'}});
  console.log(id.slice(-8), r.status, (await r.arrayBuffer()).byteLength);
}

// 3) chargement reel, comme le fait le navigateur (evite la semantique CORS de fetch)
new Image().src = `/api/projects/${id}/thumbnail?cb=${Date.now()}`;  // onload / onerror
```

## Résultat

| projet (8 derniers car.) | HTTP | `<img>` | dimensions |
|---|---|---|---|
| `qjtuhjeb` | **500** (0 octet, pas de `content-type`) | `error` | — |
| `43es7q3s` | 302 → URL signée | `load` en 1346 ms | 1280×800 |
| `bummu3vk` | **500** | `error` | — |
| `bnc2sjlg` | 302 → URL signée | `load` en 1531 ms | 1280×800 |
| `hrf98xad` | **500** | `error` | — |
| `8i3966kl` | 302 → URL signée | `load` en 450 ms | 1280×800 |

**3 vignettes sur 6 renvoient HTTP 500**, corps vide, en 458 à 869 ms.

## Contenu des 3 vignettes qui chargent

Les trois images font 1280×800 et sont **visuellement blanches**, à l'exception
d'une ligne de texte en haut à gauche. Zoom sur la zone : c'est la capture d'écran
d'une **réponse JSON 404**, rendue par le visualiseur JSON de Chrome (case
« Pretty-print » visible en haut) :

```json
{"message":"Route GET:/ not found","error":"Not found","statusCode":404}
```

Texte **identique sur les 3**, y compris pour un projet dont la carte affiche le
badge « **Deployed** ». C'est la forme d'un 404 **Fastify** (`Route <METHOD>:<path> not found`),
pas celle de l'API plateforme (qui ajoute un champ `code`).

## Ce que voit l'utilisateur

- 3 cartes : état de repli correct — icône + « No preview yet » + « A captured app
  preview will appear here » (les 3 qui renvoient 500 : le repli fonctionne).
- 3 cartes : un **rectangle quasi blanc** — la vignette a bien chargé, mais son
  contenu est la capture d'une page d'erreur.

⚠️ Les vignettes mettent **plus de 20 secondes** à apparaître sur la page (mesuré :
`complete:false` à 20 s, `complete:true, naturalWidth:1280` ensuite), alors que la
même URL chargée isolément répond en 450–1531 ms. Pendant cet intervalle les 6
cartes affichent « No preview yet », y compris celles qui ont une vignette.
