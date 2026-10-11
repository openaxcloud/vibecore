import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Le serveur doit émettre la consigne AVANT toute génération : la barrière du
 * navigateur (`useMessageParser`) ne refuse que ce qui arrive après elle.
 */
describe('câblage de la consigne « aucun fichier »', () => {
  it("api.chat émet consigneSansFichier sur un refus, avant les sous-agents et avant l'appel au modèle", () => {
    const source = readFileSync('app/routes/api.chat.ts', 'utf8');
    const refus = source.indexOf('const fichiersRefuses = refusExpliciteDeFichiers(skillUserPrompt);');
    const emission = source.indexOf("dataStream.writeMessageAnnotation({ type: 'consigneSansFichier' });");
    const sousAgents = source.indexOf('executeAgentOrchestrationStream({');
    const modele = source.indexOf('const result = await streamText({');

    expect(refus).toBeGreaterThan(-1);
    expect(emission).toBeGreaterThan(refus);
    expect(source.slice(refus, emission)).toContain('if (fichiersRefuses) {');
    expect(sousAgents).toBeGreaterThan(emission);
    expect(modele).toBeGreaterThan(emission);
  });
});
