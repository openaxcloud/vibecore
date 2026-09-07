import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Onglet Secrets — parité Replit (RP-SEC-01 à 08), ancrée sur le code.
 * La logique est dans secrets-panel.spec.ts ; ici on vérifie que le panneau
 * est bien celui de Replit, et que rien n'est simulé.
 */
const composant = readFileSync(new URL('./ProjectSecretsPanel.tsx', import.meta.url), 'utf8');
const baseChat = readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8');
const scss = readFileSync(new URL('../../styles/index.scss', import.meta.url), 'utf8');

describe('onglet Secrets — le panneau branché est le nouveau', () => {
  it('BaseChat importe le composant et ne porte plus l’ancien panneau (quatre boutons empilés)', () => {
    expect(baseChat).toContain("import { ProjectSecretsPanel } from '~/components/chat/ProjectSecretsPanel';");
    expect(baseChat).not.toMatch(/function ProjectSecretsPanel\(/);
    expect(baseChat).not.toContain('bolt-project-secrets-tool');
  });

  it('en-tête : titre, menu ⋮ (Docs / JSON / .env), « Nouveau secret » — pas d’icône de lien sans secrets de compte', () => {
    expect(composant).toContain('data-testid="secrets-menu"');
    expect(composant).toContain('data-testid="secrets-new"');
    expect(composant).toMatch(
      /secretsPanel\.menu\.docs[\s\S]*secretsPanel\.menu\.editJson[\s\S]*secretsPanel\.menu\.editEnv/,
    );
    expect(composant).not.toMatch(/i-ph:link\b/);
  });

  it('filtre, ajout en ligne grisé tant qu’il manque une clé valide ou une valeur', () => {
    expect(composant).toContain('data-testid="secrets-filter"');
    expect(composant).toContain('filtrerLesSecrets(secrets, filtre)');
    expect(composant).toContain('disabled={!ajoutPossible}');
    expect(composant).toContain('const ajoutPossible = peutAjouter(cle, valeur) && !busy;');
  });

  it('une ligne = puce clé, puce valeur masquée avec œil, ⋮ → Modifier / Trouver les usages / Supprimer', () => {
    expect(composant).toContain('bolt-secrets-chip bolt-secrets-chip--key');
    expect(composant).toContain('bolt-secrets-chip bolt-secrets-chip--value');
    expect(composant).toContain("{revele ?? '••••••••'}");
    expect(composant).toMatch(
      /secretsPanel\.row\.edit[\s\S]*secretsPanel\.row\.findUsages[\s\S]*secretsPanel\.row\.delete/,
    );
    expect(composant).toContain('bolt-secrets-menu-item bolt-secrets-menu-item--danger');
  });

  it('les valeurs ne sont jamais listées : révélation par clé, éditeurs sans valeurs', () => {
    expect(composant).toContain('reveal=true&confirm=1&key=');
    expect(composant).toContain('texteEnvDepuisCles(cles) : texteJsonDepuisCles(cles)');
  });
});

describe('onglet Secrets — le gabarit', () => {
  it('trois éléments de 44 px par ligne : clé, valeur, ⋮', () => {
    expect(scss).toMatch(/\.bolt-secrets-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) 44px;/);
    expect(scss).toMatch(/\.bolt-secrets-chip \{[\s\S]*?height: 44px;/);
    expect(scss).toMatch(/\.bolt-secrets-icon-button \{[\s\S]*?width: 44px;\s*height: 44px;/);
  });

  it('les libellés Clé / Valeur ont la même hauteur, œil ou pas', () => {
    expect(scss).toMatch(/\.bolt-secrets-field > span \{[\s\S]*?height: 28px;/);
  });

  it('le menu flotte au-dessus du panneau, l’éditeur au-dessus des feuilles', () => {
    expect(scss).toMatch(/\.bolt-secrets-menu \{\s*position: fixed;\s*z-index: 12045;/);
    expect(scss).toMatch(/\.bolt-secrets-editor-veil \{\s*position: fixed;\s*inset: 0;\s*z-index: 12059;/);
  });
});
