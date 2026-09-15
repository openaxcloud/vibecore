import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * UNIF (lot F) — gardes SOURCE sur les boutons d'action de panneau.
 *
 * La coque service et le Debugger portaient des boutons ad hoc
 * (`rounded border border-bolt-elements-borderColor px-2 py-1 text-[12px]`,
 * variante text-xs) à côté des PanelButton : trois tailles de bouton dans le
 * même panneau. Les actions compactes (Copy / Dismiss / Retry / Refresh
 * runtime) passent par `PanelButton size="sm"` (28 px), même famille d'états
 * hover/focus/disabled que les CTA.
 */

const baseChatSource = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');

const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

const baseChatCode = codeOnly(baseChatSource);

describe('UNIF — boutons d’action de panneau (lot F)', () => {
  it('les boutons ad hoc de la coque service et du Debugger ont disparu', () => {
    expect(baseChatCode).not.toContain(
      'className="rounded border border-bolt-elements-borderColor px-2 py-1 text-[12px]',
    );
    expect(baseChatCode).not.toContain(
      'className="rounded border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"',
    );
  });

  it('les actions compactes passent par PanelButton size="sm" (au moins 4)', () => {
    const occurrences = baseChatCode.match(/<PanelButton[^>]*size="sm"/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
  });
});
