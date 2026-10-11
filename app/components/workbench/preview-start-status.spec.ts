import { describe, expect, it } from 'vitest';
import { previewStartStatus } from './preview-start-status';

const envelopper = (label: string) => `Démarrage de ${label}…`;

describe('previewStartStatus — BUG-PREVIEW-COPY-001', () => {
  it('enveloppe le libellé d’une COMMANDE réellement lancée', () => {
    expect(previewStartStatus('pnpm dev', 'pnpm dev', envelopper)).toBe('Démarrage de pnpm dev…');
  });

  it('laisse une PHRASE de statut telle quelle — plus de « Démarrage de Démarrage de l’aperçu… »', () => {
    expect(previewStartStatus('Démarrage de l’aperçu', 'pnpm dev', envelopper)).toBe('Démarrage de l’aperçu');
    expect(previewStartStatus('Serveur d’aperçu reconnecté', undefined, envelopper)).toBe(
      'Serveur d’aperçu reconnecté',
    );
  });

  it('sans commande enregistrée, rien n’est enveloppé', () => {
    expect(previewStartStatus('pnpm dev', undefined, envelopper)).toBe('pnpm dev');
  });
});
