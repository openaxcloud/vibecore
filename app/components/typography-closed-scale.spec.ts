import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * UNIF lot 5 — échelle typo fermée hors BaseChat.
 *
 * `panel-typography.spec.ts` verrouille déjà BaseChat.tsx ; ce spec verrouille
 * les surfaces traitées par le lot 5 (chat/AssistantMessage, settings, auth,
 * deploy, dashboard, git, marketing ecode-exact) : plus aucun `text-[9px]` /
 * `text-[10px]` — le plus petit corps autorisé est `text-[11px]`.
 *
 * Volontairement un spec séparé (nouveau fichier) pour ne pas toucher aux
 * fichiers que les lots 2/3/4 (non mergés) modifient déjà.
 */

const LOT5_FILES = [
  'app/components/chat/AssistantMessage.tsx',
  'app/components/@settings/tabs/mcp/McpMarketplace.tsx',
  'app/components/@settings/core/ControlPanel.tsx',
  'app/components/auth/AuthScreen.tsx',
  'app/components/deploy/DeploymentOverview.tsx',
  'app/components/deploy/DeploymentTypeSelector.tsx',
  'app/components/dashboard/SaaSLayout.tsx',
  'app/components/git/GitStatusBadge.tsx',
  'app/components/git/GitBranchSyncControls.tsx',
  'app/components/git/GitSettingsPanel.tsx',
  'app/components/git/GitProviderConnectPanel.tsx',
  'app/components/marketing/ecode-exact/EcodeExactLandingControls.tsx',
  'app/components/marketing/ecode-exact/pages/Pricing.tsx',
  'app/components/marketing/ecode-exact/pages/AIAgent.tsx',
];

describe('closed typography scale (UNIF lot 5)', () => {
  it.each(LOT5_FILES)('%s has no text below 11px', (relativePath) => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

    expect(source).not.toContain('text-[9px]');
    expect(source).not.toContain('text-[10px]');
  });
});
