import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * `api.chat.ts` fait 2500 lignes et aucun test ne la monte : la règle vit dans
 * une fonction pure (`facturation-abandon.ts`, testée à côté), et CE fichier
 * vérifie qu'elle est réellement APPLIQUÉE. Sans cette moitié, la règle serait
 * juste et la route pourrait ne jamais l'appeler — c'est exactement le défaut
 * qu'on corrige ici, à l'envers.
 *
 * Même patron que `api.chat.web-reference-cablage.spec.ts`.
 */

const CHAT = readFileSync(join(process.cwd(), 'app/routes/api.chat.ts'), 'utf8');

const compter = (aiguille: string) => CHAT.split(aiguille).length - 1;

describe('api.chat.ts — un tour abandonné est porté au registre', () => {
  it('témoin positif : le fichier est bien lu et porte ses repères connus', () => {
    expect(CHAT.length).toBeGreaterThan(50_000);
    expect(CHAT).toContain('const flushUsage = async (terminalFinishReason: string) => {');
    expect(CHAT).toContain('onError: (error: any) => {');
  });

  it('la décision est prise par la fonction pure, pas réécrite sur place', () => {
    expect(CHAT).toContain("import { decisionDeFacturationSurAbandon } from '~/lib/.server/llm/facturation-abandon';");
    expect(CHAT).toContain('decisionDeFacturationSurAbandon({');
  });

  it('le chemin d’abandon facture : l’appel au registre est DANS la branche de décision', () => {
    const debut = CHAT.indexOf('const factureAbandon = decisionDeFacturationSurAbandon({');

    expect(debut).toBeGreaterThan(0);

    const branche = CHAT.slice(debut, debut + 2200);

    expect(branche).toContain('if (factureAbandon.facturer) {');
    expect(branche).toContain('recordChatUsage({');
    expect(branche).toContain('finishReason: factureAbandon.finishReason');
  });

  it('l’abandon est reconnu au code de flux, pas à une panne fournisseur', () => {
    expect(CHAT).toContain("abandonneParLeClient: code === 'STREAM_ABORTED'");
  });

  it('UNE SEULE facture par tour : le drapeau est posé, lu par flushUsage ET par l’abandon', () => {
    /*
     * La double facturation coûte à l'utilisateur ; c'est le risque que ce
     * correctif introduit s'il est mal tenu. Le drapeau doit donc exister en
     * portée externe, sortir de `flushUsage` en premier, et être passé à la
     * décision d'abandon.
     */
    expect(CHAT).toContain('let tourDejaFacture = false;');
    expect(CHAT).toContain('dejaFacture: tourDejaFacture');

    const debutFlush = CHAT.indexOf('const flushUsage = async (terminalFinishReason: string) => {');
    const enTete = CHAT.slice(debutFlush, debutFlush + 260);

    expect(enTete).toContain('if (tourDejaFacture) {');
    expect(enTete).toContain('tourDejaFacture = true;');

    // Posé aux DEUX endroits qui facturent, et nulle part ailleurs.
    expect(compter('tourDejaFacture = true;')).toBe(2);
  });
});
