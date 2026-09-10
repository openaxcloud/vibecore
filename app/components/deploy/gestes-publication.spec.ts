/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';

/*
 * BUG-PUBLISH-ONSUBMIT-FORMDATA-001 — « aucun bouton fonctionne » (Avi).
 *
 * Le panneau appelle `onSubmit` de DEUX façons : en gestionnaire de
 * `<form onSubmit={...}>` (il reçoit un événement React), et DIRECTEMENT avec
 * un `FormData` déjà rempli pour les gestes « annuler / republier / revenir en
 * arrière ». Le gestionnaire ne gérait que le premier cas : sa toute première
 * instruction était `event.preventDefault()`, que `FormData` n'a pas.
 *
 * Le throw était INVISIBLE — fonction `async`, donc promesse rejetée ; appelant
 * sans `await` ni `.catch`. Quatre boutons morts, aucun message.
 *
 * POURQUOI MA GARDE PRÉCÉDENTE N'A RIEN VU. Celle de BUG-PUBLISH-NOOP-001
 * vérifiait que la SOURCE contenait bien `onSubmit(donnees)`. C'est du câblage,
 * pas du comportement : elle serait restée verte pendant que le bouton ne
 * faisait rien. Ce test-ci EXÉCUTE l'appel.
 */

/** La forme exacte du gestionnaire réel, réduite à ce qui décide du sort de l'appel. */
function gestionnaireDuPanneau(reseau: (formData: FormData) => void) {
  return async function submit(entree: React.FormEvent<HTMLFormElement> | FormData) {
    const formulaire = entree instanceof FormData ? null : (entree as any).currentTarget;

    if (formulaire) {
      (entree as any).preventDefault();
    }

    const formData = entree instanceof FormData ? entree : new FormData(formulaire);
    reseau(formData);
  };
}

/* Un VRAI <form> : un double d'objet ne se laisse pas lire par `new FormData(...)`. */
function evenementDeFormulaire(champs: Record<string, string>) {
  document.body.innerHTML = `<form>${Object.entries(champs)
    .map(([k, v]) => `<input name="${k}" value="${v}" />`)
    .join('')}</form>`;

  return {
    preventDefault: vi.fn(),
    currentTarget: document.querySelector('form')!,
  } as unknown as React.FormEvent<HTMLFormElement>;
}

describe('le fait mesuré', () => {
  it('FormData n’a pas de preventDefault — c’est là que les quatre boutons mouraient', () => {
    const donnees = new FormData();
    expect(typeof (donnees as unknown as { preventDefault?: unknown }).preventDefault).toBe('undefined');
  });

  it('un gestionnaire qui appelle preventDefault sans garde REJETTE en silence', async () => {
    const ancien = async (event: any) => {
      event.preventDefault();
    };

    // `async` : le throw devient un rejet, pas une exception synchrone.
    await expect(ancien(new FormData())).rejects.toThrow(/preventDefault is not a function/u);
  });
});

describe('les gestes du panneau atteignent le réseau', () => {
  it('un FormData passe, et arrive INTACT au réseau', async () => {
    const envoye: FormData[] = [];
    const submit = gestionnaireDuPanneau((f) => envoye.push(f));

    for (const intent of ['cancel', 'redeploy', 'rollback']) {
      const donnees = new FormData();
      donnees.set('intent', intent);
      donnees.set('deploymentId', `dep_${intent}`);

      await submit(donnees);
    }

    expect(envoye.map((f) => f.get('intent'))).toEqual(['cancel', 'redeploy', 'rollback']);
    expect(envoye.map((f) => f.get('deploymentId'))).toEqual(['dep_cancel', 'dep_redeploy', 'dep_rollback']);
  });

  it('un événement de formulaire passe TOUJOURS, et son defaut est bien empêché', async () => {
    const envoye: FormData[] = [];
    const submit = gestionnaireDuPanneau((f) => envoye.push(f));
    const evenement = evenementDeFormulaire({ intent: 'install-package' });

    await submit(evenement);

    expect((evenement as any).preventDefault).toHaveBeenCalledOnce();
    expect(envoye).toHaveLength(1);
  });

  it('aucun rejet silencieux : la promesse aboutit dans les deux cas', async () => {
    const submit = gestionnaireDuPanneau(() => {});

    await expect(submit(new FormData())).resolves.toBeUndefined();
    await expect(submit(evenementDeFormulaire({ intent: 'x' }))).resolves.toBeUndefined();
  });
});

/*
 * ⚠️ CE FICHIER EXÉCUTE UNE COPIE RÉDUITE du gestionnaire. C'est ce qui permet
 * de prouver le MÉCANISME — le rejet silencieux — sans monter le monolithe.
 * Mais une copie ne garde pas l'original : réintroduire le défaut dans
 * `BaseChat.tsx` laisserait tout ce qui précède au vert.
 *
 * La seconde moitié de la garde, qui lit le VRAI code, vit dans
 * `gestes-publication-source.spec.ts`, en environnement `node`.
 *
 * POURQUOI DEUX FICHIERS, et ce que je sais exactement. Les deux moitiés
 * réunies ici passaient seules et en lot de dix-neuf, mais la suite COMPLÈTE a
 * refusé de collecter ce fichier sur `TypeError: The URL must be of scheme
 * file` — un message qui appartient à une version antérieure de ce test, alors
 * que la source affichée à côté était bien la nouvelle. Je n'ai pas établi la
 * cause de cet écart, et je ne la devine pas ici.
 *
 * Ce que je sais tenir : un test qui EXÉCUTE du code n'a pas besoin de lire des
 * fichiers, et un test qui lit des fichiers n'a pas besoin de `jsdom`. Les
 * séparer ne repose sur aucune hypothèse — c'est la forme juste, et elle retire
 * du même coup la seule chose qui différenciait ce fichier des autres.
 */
