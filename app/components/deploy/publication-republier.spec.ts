import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { intentionDeRepublication } from './publication';

/*
 * BUG-PUBLISH-NOOP-001 — « quand je clique sur publish ça lance pas le
 * déploiement ça me renvoi vers gérer » (Avi, iPhone, 09/09).
 *
 * Deux moitiés, et il faut les DEUX : la règle (que doit faire le bouton) et
 * le câblage (le panneau l'applique-t-il vraiment). Une règle juste branchée
 * sur rien laisse le bouton mort ; un câblage juste sur une règle fausse aussi.
 */
describe('intentionDeRepublication', () => {
  it('rejoue le dernier déploiement quand il en existe un', () => {
    expect(intentionDeRepublication([{ id: 'dep_2' }, { id: 'dep_1' }])).toEqual({
      geste: 'redeploy',
      deploymentId: 'dep_2',
    });
  });

  it("ouvre l'assistant quand aucun déploiement n'existe", () => {
    expect(intentionDeRepublication([])).toEqual({ geste: 'assistant' });
    expect(intentionDeRepublication(undefined)).toEqual({ geste: 'assistant' });
  });

  it("ouvre l'assistant plutôt que de poster un identifiant vide", () => {
    // Sans cette garde, la route rend DEPLOYMENT_REQUIRED : un échec muet.
    expect(intentionDeRepublication([{ id: '   ' }])).toEqual({ geste: 'assistant' });
    expect(intentionDeRepublication([{} as { id?: string }])).toEqual({ geste: 'assistant' });
  });
});

describe('le panneau Déploiements applique la règle', () => {
  const source = readFileSync(join(process.cwd(), 'app/components/chat/BaseChat.tsx'), 'utf8');

  it('câble onRepublier sur le rappel qui déploie, pas sur un changement d’onglet', () => {
    const prop = /onRepublier=\{([^}]*)\}/u.exec(source);
    expect(prop, 'la prop onRepublier a disparu du panneau').not.toBeNull();
    expect(prop![1].trim()).toBe('republier');
  });

  it("le rappel envoie l'intention redeploy avec l'identifiant décidé par la règle", () => {
    const rappel = /const republier = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[/u.exec(source);
    expect(rappel, 'le rappel republier a disparu').not.toBeNull();

    const corps = rappel![1];
    expect(corps).toContain('intentionDeRepublication(deployments)');
    expect(corps).toContain("donnees.set('intent', 'redeploy')");
    expect(corps).toContain("donnees.set('deploymentId', intention.deploymentId)");
    expect(corps).toContain('onSubmit(donnees)');
  });
});
