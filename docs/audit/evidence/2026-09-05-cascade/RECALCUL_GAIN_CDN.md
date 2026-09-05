# Gain CDN, recalculé sur la vraie page — et revu à la baisse

**Ce document remplace la fourchette de 1,5 à 2,5 s.** Elle était fausse : elle
reposait sur sept vagues mesurées sur une page **404**, pas sur une page projet.

## Ce que fait vraiment une première visite sur une page projet

Env d'audit, WebKit/iPhone 15 Pro, page `/projects/<id>/ide`, statut 200 vérifié.

| | |
|---|---:|
| requêtes | **131** |
| dont **statique** | **77** |
| dont **API** | **43** |
| dont autre | 11 |
| temps mural | **5 700 ms** |

Pour mémoire, ce que je croyais mesurer : 73 requêtes dont **2** d'API. La page
404 ne fait pas les appels de données ; c'est ce chiffre-là qui aurait dû
m'arrêter, et je l'avais expliqué au lieu de le suivre.

## Le chemin critique, échantillonné toutes les 50 ms

C'est le calcul qui décide, et il ne se déduit pas des totaux : un cumul de
TTFB n'est pas du temps mural.

| ce qui est en vol | durée | part | ce qu'un CDN y peut |
|---|---:|---:|---|
| **statique SEUL** | 1 900 ms | **33 %** | le raccourcir |
| statique + API | 1 000 ms | 18 % | gain partiel au mieux |
| **API seule** | 2 600 ms | **46 %** | **rien** |
| rien (CPU / logique) | 250 ms | 4 % | rien |

Le statique part à 800 ms et finit à 4 597 ms. **L'API ne commence qu'à
3 119 ms** — il faut que le JS soit chargé et exécuté — et finit avec la page,
à 5 700 ms.

**Un CDN n'accélère que le statique. Sur cette page, 46 % du temps mural ne le
concerne pas du tout.**

## La fourchette recalculée — **estimation, pas mesure**

Le statique passe ~92 % de son temps réseau à attendre. Sa travée s'étend sur
3 797 ms pour un TTFB médian de ~380 ms, soit environ dix vagues successives.
Avec un cache de bord à ~30 ms de TTFB, cette travée tomberait vers 600 ms.
Seule la part où le statique est **seul** sur le chemin critique se convertit en
temps mural gagné.

> **Estimation révisée : 1,0 à 1,8 seconde** sur une première visite de
> 5,7 secondes — soit **18 à 32 %**.
>
> L'estimation précédente annonçait 1,5 à 2,5 s sur une coquille de 3,2 s,
> c'est-à-dire **50 à 75 %**. Elle était non seulement fausse de base, elle
> était optimiste d'un facteur deux à trois **en proportion**.

### Ce qui borne cette fourchette

- **Mesurée sur l'environnement d'audit, pas en production.** En production le
  TTFB médian du statique est **2,2× pire** (804–1 079 ms contre 359–395 ms) :
  la travée statique y serait plus longue et le gain absolu probablement plus
  grand. Non mesurable — la page projet demande un compte, et je n'en crée pas
  en production.
- **La travée mixte (18 %) est comptée à zéro.** Elle pourrait convertir en
  partie ; je préfère ne pas m'en prévaloir.
- **L'API pourrait démarrer plus tôt** si le JS arrive plus vite, ce qui
  tirerait toute la traîne en avant. Effet non chiffré, non revendiqué.

## Ce que ce gain concerne exactement

**La première visite d'un nouvel utilisateur. Rien d'autre.**

Le cache est correct — `immutable` et `304` vérifiés en production. Un visiteur
qui revient ne paie rien aujourd'hui déjà, et ne gagnera donc rien.

Ce gain ne doit pas être énoncé en moyenne : une moyenne sur tous les
chargements le noierait, alors que c'est précisément le premier contact qui
décide si quelqu'un reste. **Peu fréquent, beaucoup en enjeu.**

## Faut-il encore le proposer ?

Oui, mais sur des chiffres qui ne promettent plus la moitié du temps de
chargement. Une à deux secondes sur le premier contact d'un nouvel utilisateur,
pour un changement DNS et une règle de cache sur `/assets/*`, reste un bon
rapport — la bande passante est déjà payée aujourd'hui à un tarif supérieur.

Ce qui change surtout, c'est ce que ça n'est pas : **ce n'est pas la réponse aux
neuf secondes.** Près de la moitié du temps mural est occupée par des appels de
données que rien de tout cela n'accélère. Si l'objectif est le temps d'affichage
réel, le levier est là — et il n'est pas d'infrastructure.
