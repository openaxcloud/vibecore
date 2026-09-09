/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CODE_CONFLIT_DISTANT, FilesStore } from './files';

/*
 * BUG-IDE-004 — une édition prise dans un conflit ne pouvait être persistée
 * NULLE PART. Mesuré live le 06/08 : l'onglet restait sale après le bouton
 * Save, Ctrl+S ET Cmd+S, et l'édition était absente des trois magasins
 * (project storage, ide-state, runtime). Le garde de concurrence protégeait
 * le fichier distant en sacrifiant le travail de l'utilisateur.
 *
 * Deux choses manquaient, et il faut les deux : reconnaître le conflit
 * autrement qu'en lisant une phrase traduite, et OFFRIR UNE SORTIE.
 */
const CHEMIN = '/home/project/README.md';

function magasin(contenuDistant: string) {
  const ecrits: Array<{ chemin: string; contenu: string }> = [];

  const runtime = {
    workdir: '/home/project',
    mode: 'remote-kubernetes' as const,
    hasWorkspaceId: () => true,
    listFiles: vi.fn(async () => []),
    readFile: vi.fn(async () => ({ content: contenuDistant, encoding: 'utf8' as const })),
    writeFile: vi.fn(async (chemin: string, contenu: string) => {
      ecrits.push({ chemin, contenu });
    }),
    watchFiles: vi.fn(async () => () => {}),
    watchPorts: vi.fn(async () => () => {}),
  } as unknown as ConstructorParameters<typeof FilesStore>[0];

  const store = new FilesStore(runtime);
  store.files.set({ [CHEMIN]: { type: 'file', content: '# qa-clusterb\n', isBinary: false } });

  return { store, ecrits };
}

describe('conflit de sauvegarde côté humain', () => {
  it('refuse par défaut — rien n’est écrasé en silence', async () => {
    const { store, ecrits } = magasin('# modifié ailleurs\n');

    await expect(store.saveFile(CHEMIN, '# mon travail\n')).rejects.toMatchObject({
      code: CODE_CONFLIT_DISTANT,
      filePath: CHEMIN,
    });
    expect(ecrits, 'rien ne doit partir au runtime sur un refus').toEqual([]);
  });

  it('porte un CODE, pour ne pas reconnaître un conflit à une phrase traduite', async () => {
    const { store } = magasin('# modifié ailleurs\n');

    const erreur = await store.saveFile(CHEMIN, '# mon travail\n').catch((e) => e);

    /*
     * Le message reste localisé pour l'humain ; c'est le code qui pilote
     * l'interface. Sans lui, la première retraduction casserait l'affordance
     * de conflit sans qu'un seul test ne rougisse (règle 5).
     */
    expect(erreur.code).toBe(CODE_CONFLIT_DISTANT);
    expect(typeof erreur.message).toBe('string');
    expect(erreur.message.length).toBeGreaterThan(0);
  });

  it('« overwrite » EST la sortie : le travail de l’utilisateur est enfin écrit', async () => {
    const { store, ecrits } = magasin('# modifié ailleurs\n');

    await store.saveFile(CHEMIN, '# mon travail\n', { onRemoteConflict: 'overwrite' });

    expect(
      ecrits.map((e) => e.contenu),
      'c’est SA version qui doit partir',
    ).toEqual(['# mon travail\n']);
    expect(store.files.get()[CHEMIN]).toMatchObject({ content: '# mon travail\n' });
  });

  it('sans conflit, « overwrite » ne change rien au comportement normal', async () => {
    const { store, ecrits } = magasin('# qa-clusterb\n');

    await store.saveFile(CHEMIN, '# mon travail\n', { onRemoteConflict: 'overwrite' });
    expect(ecrits.map((e) => e.contenu)).toEqual(['# mon travail\n']);
  });

  it('la voie « reconcile » de l’agent reste intacte', async () => {
    const { store, ecrits } = magasin('# modifié ailleurs\n');

    await store.saveFile(CHEMIN, '# version agent\n', { onRemoteConflict: 'reconcile' });

    // Non-JSON : la règle de reconciliation garde NOTRE contenu.
    expect(ecrits.map((e) => e.contenu)).toEqual(['# version agent\n']);
  });
});

describe("l'éditeur offre bien la sortie à l'utilisateur", () => {
  /* Commentaires retirés : un test lit du code, jamais la prose qui l'explique. */
  const source = readFileSync(join(process.cwd(), 'app/components/chat/BaseChat.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');

  const gestion = (() => {
    const debut = source.indexOf('const handleSaveError = useCallback(');
    expect(debut, 'handleSaveError a disparu').toBeGreaterThan(-1);

    return source.slice(debut, source.indexOf('const onProjectEditorSave', debut));
  })();

  it('distingue le conflit par son CODE, pas par son texte', () => {
    expect(gestion).toContain('CODE_CONFLIT_DISTANT');
    expect(gestion, 'un message traduit ne doit pas piloter la logique').not.toMatch(/=== ['"].*changé/u);
  });

  it("propose d'écraser, et c'est bien un geste de l'utilisateur", () => {
    expect(gestion).toContain("onRemoteConflict: 'overwrite'");
    expect(gestion).toContain('saveConflictOverwrite');
    expect(gestion, "l'invite ne doit pas disparaître toute seule").toContain('autoClose: false');
  });

  it('sait de QUEL fichier il parle, même depuis le bouton d’un onglet inactif', () => {
    expect(source).toContain('handleSaveError(error, filePath)');
  });
});
