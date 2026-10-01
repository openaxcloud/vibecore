import { describe, expect, it } from 'vitest';

import { shouldUseAgentOrchestration, texteDeLUtilisateur } from './agent-orchestration';

/*
 * LES MESSAGES RÉELS, tels qu'enregistrés en production le 2026-09-30 (compte
 * de test, projet `cmuntsjrh003u0na5bekd8t7m`) : le composeur préfixe le texte de
 * l'utilisateur d'une enveloppe `<vibecore_agent_request>` en mode Agent.
 */
const ENVELOPPE_AGENT = [
  '<vibecore_agent_request>',
  '- Mode: Agent. Exécutez la tâche demandée de bout en bout avec vérification.',
  '- Plan first is disabled: proceed according to the selected mode, but keep changes scoped and verify them.',
  '- Diff review is enforced by the IDE: file edits are captured as patch proposals and must be accepted or rejected by the user before they are applied.',
  '</vibecore_agent_request>',
  '',
  '',
].join('\n');

const message = (texte: string) => ({
  role: 'user' as const,
  content: `[Model: claude-opus-5]\n\n[Provider: Anthropic]\n\n${ENVELOPPE_AGENT}${texte}`,
});

const UN_FICHIER = 'Crée le fichier note-1790756197097.txt contenant exactement "ok". Rien d\'autre.';

const SANS_FICHIER =
  "Explique en quarante lignes numérotées, sans écrire aucun fichier, les étapes 81 à 120 d'un projet web. N'écris aucun fichier.";
const VRAI_CHANTIER =
  "Construis une application de gestion d'équipe : authentification, base de données des membres, tableau de bord responsive, API REST et tests.";

describe('les sous-agents ne se lancent que sur ce que l’UTILISATEUR a écrit', () => {
  it('le texte de l’utilisateur se lit sans notre enveloppe ni nos préfixes', () => {
    expect(texteDeLUtilisateur(message(UN_FICHIER))).toBe(UN_FICHIER);
  });

  it('LE CONSTAT : notre enveloppe pèse à elle seule plus que le seuil de complexité', () => {
    expect(ENVELOPPE_AGENT.length).toBeGreaterThan(180);
    expect(ENVELOPPE_AGENT).toContain('applied');
  });

  it('« Crée un fichier. Rien d’autre. » ne lance pas de sous-agents', () => {
    expect(shouldUseAgentOrchestration([message(UN_FICHIER)], 'build')).toBe(false);
  });

  it('« N’écris aucun fichier » ne lance pas de sous-agents', () => {
    expect(shouldUseAgentOrchestration([message(SANS_FICHIER)], 'build')).toBe(false);
  });

  it('même avec le bouton « Plan » : les rôles existent pour écrire', () => {
    expect(shouldUseAgentOrchestration([message(SANS_FICHIER)], 'build', { planFirst: true })).toBe(false);
  });

  it('contre-épreuve : un vrai chantier lance toujours les sous-agents', () => {
    expect(shouldUseAgentOrchestration([message(VRAI_CHANTIER)], 'build')).toBe(true);
  });

  it('contre-épreuve : le bouton « Plan » lance toujours les sous-agents sur une demande courte', () => {
    expect(shouldUseAgentOrchestration([message('Ajoute un bouton.')], 'build', { planFirst: true })).toBe(true);
  });
});
