/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { donneesDuFormulaire } from './donnees-du-formulaire';

/*
 * BUG-GIT-001 — « Committer les modifications » répondait 200 et ne
 * committait rien (audit du 15/08, 2 projets sur 2 : `HEAD` inchangé,
 * 0 fichier indexé, aucune route d'écriture git atteinte).
 */
function formulaireDeCommit() {
  document.body.innerHTML = `
    <form>
      <input name="message" value="QA: commit local depuis le panneau Git" />
      <button type="submit" name="intent" value="commit">Committer</button>
      <button type="submit" name="intent" value="commit-push">Committer et pousser</button>
    </form>`;

  const formulaire = document.querySelector('form')!;
  const boutons = [...document.querySelectorAll('button')];

  return { formulaire, boutons };
}

describe('le fait qui a causé le défaut', () => {
  it('new FormData(form) PERD la valeur du bouton d’envoi', () => {
    const { formulaire } = formulaireDeCommit();
    const donnees = new FormData(formulaire);

    // Le reste du formulaire passe : c'est ce qui rendait le défaut invisible.
    expect(donnees.get('message')).toBe('QA: commit local depuis le panneau Git');
    expect(donnees.get('intent'), 'c’est ICI que l’intention disparaissait').toBeNull();
  });
});

describe('donneesDuFormulaire', () => {
  it('garde l’intention portée par le bouton réellement pressé', () => {
    const { formulaire, boutons } = formulaireDeCommit();

    for (const [index, attendu] of [
      [0, 'commit'],
      [1, 'commit-push'],
    ] as const) {
      const evenement = new Event('submit') as SubmitEvent;
      Object.defineProperty(evenement, 'submitter', { value: boutons[index] });

      const donnees = donneesDuFormulaire({ currentTarget: formulaire, nativeEvent: evenement });

      expect(donnees.get('intent')).toBe(attendu);
      expect(donnees.get('message')).toBe('QA: commit local depuis le panneau Git');
    }
  });

  it('rattrape la paire à la main si le moteur ignore le second paramètre', () => {
    const { formulaire, boutons } = formulaireDeCommit();
    const natif = globalThis.FormData;

    // Un moteur ancien : le second argument est simplement ignoré.
    class FormDataSansEnvoyeur extends natif {
      constructor(form?: HTMLFormElement) {
        super(form);
      }
    }

    globalThis.FormData = FormDataSansEnvoyeur as unknown as typeof FormData;

    try {
      const evenement = new Event('submit') as SubmitEvent;
      Object.defineProperty(evenement, 'submitter', { value: boutons[0] });

      expect(donneesDuFormulaire({ currentTarget: formulaire, nativeEvent: evenement }).get('intent')).toBe('commit');
    } finally {
      globalThis.FormData = natif;
    }
  });

  it('ne casse rien quand aucun bouton n’a envoyé le formulaire', () => {
    const { formulaire } = formulaireDeCommit();
    const donnees = donneesDuFormulaire({ currentTarget: formulaire, nativeEvent: new Event('submit') });

    expect(donnees.get('message')).toBe('QA: commit local depuis le panneau Git');
  });
});

describe('les appelants appliquent la règle', () => {
  /*
   * On retire les commentaires AVANT d'affirmer quoi que ce soit. Sans cela le
   * test rougissait sur la prose qui EXPLIQUE le défaut — les commentaires que
   * j'ai écrits citent `new FormData(form)` mot pour mot. Un test doit lire du
   * code, jamais de la prose (règle 5).
   */
  const lire = (chemin: string) =>
    readFileSync(join(process.cwd(), chemin), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');

  it('le panneau Git ne reconstruit plus les données sans son bouton', () => {
    const source = lire('app/components/git/GitTab.tsx');
    const submit = /const submitAction = useCallback\(([\s\S]*?)\n {4}\},/u.exec(source);

    expect(submit, 'submitAction a disparu').not.toBeNull();
    expect(submit![1]).toContain('donneesDuFormulaire(event)');
    expect(submit![1], 'l’intention repartirait vide').not.toContain('new FormData(form)');
  });

  it('le submit générique des panneaux applique la même règle', () => {
    const source = lire('app/components/chat/BaseChat.tsx');

    const submit = /async function submit\(event: React\.FormEvent<HTMLFormElement>\) \{([\s\S]*?)\n {4}try \{/u.exec(
      source,
    );

    expect(submit, 'le submit générique a disparu').not.toBeNull();
    expect(submit![1]).toContain('donneesDuFormulaire(event)');
    expect(submit![1]).not.toContain('new FormData(form)');
  });
});
