---
id: BUG-QA1011-DESABONNEMENT-NEWSLETTER-SANS-EFFET
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**Les pages `/newsletter/unsubscribe` et `/newsletter/confirm` promettent une action qu'aucun code n'exécute.**
Trouvé le 2026-10-11 en balayant les 13 pages publiques hors de la liste de l'audit français (rendu sans session,
aucun bouton actionné).

- `/newsletter/unsubscribe` (liée depuis le pied de page de TOUTES les pages publiques, `EcodeExactShell.tsx`) :
  « Gérez les e-mails de la newsletter… ou désabonnez-vous ». Page statique (`MarketingStaticPage`) ; son seul
  bouton, « Conserver les actualités produit », est un LIEN vers `/newsletter-confirmed`. Le jeton `?token=` des
  liens n'est lu par personne. L'API n'a **aucune** route de désabonnement : seule `POST /newsletter/subscribe`
  existe (`services/api/src/app.ts`).
- `/newsletter/confirm` : « Confirmer les préférences » est un lien vers `/newsletter-confirmed`, qui affiche
  « Votre abonnement à la newsletter E-Code est confirmé ». Rien n'écrit `confirmedAt`.
- Aucun code n'envoie de lettre d'information : la table `NewsletterSubscriber` n'est lue nulle part ailleurs que
  dans l'inscription.

## Impact mesuré (production, 2026-10-11, lecture seule, comptes seulement)

**1 abonné** (inscrit le 2026-07-02), 0 confirmé, 0 désabonné ; témoin : 400 utilisateurs lus. Aucune lettre n'est
jamais partie : personne n'est aujourd'hui piégé. Le défaut devient réel le jour où une lettre est envoyée — un
désabonnement qui ne désabonne pas est alors un manquement (RGPD, droit d'opposition).

## Non corrigé

Décision produit attendue : brancher un vrai désabonnement (route + jeton) AVANT tout premier envoi, ou retirer les
deux pages et le lien de pied de page tant qu'aucune lettre n'existe. **Ne touche pas `services/api/src/app.ts`**
(constat seul).
