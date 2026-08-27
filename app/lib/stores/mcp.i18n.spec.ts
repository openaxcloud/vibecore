/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMCPStore } from './mcp';
import { getI18nInstance } from '~/lib/i18n/runtime';

describe('MCP store i18n errors', () => {
  beforeEach(async () => {
    await getI18nInstance().changeLanguage('fr');
    useMCPStore.setState({ error: null, isUpdatingConfig: false });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    useMCPStore.setState({ error: null, isUpdatingConfig: false });
    await getI18nInstance().changeLanguage('en');
  });

  it('maps technical update failures to reviewed French copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('database_password=secret', { status: 500 })));

    const { settings, updateSettings } = useMCPStore.getState();

    await expect(updateSettings(settings)).rejects.toThrow(
      'Impossible de mettre à jour la configuration MCP. Vérifiez-la, puis réessayez.',
    );
    expect(useMCPStore.getState().error).toBe(
      'Impossible de mettre à jour la configuration MCP. Vérifiez-la, puis réessayez.',
    );
    expect(useMCPStore.getState().error).not.toContain('database_password');
  });

  it('localizes the update-in-progress error', async () => {
    useMCPStore.setState({ isUpdatingConfig: true });

    const { settings, updateSettings } = useMCPStore.getState();

    await expect(updateSettings(settings)).rejects.toThrow(
      'Une mise à jour de la configuration MCP est déjà en cours. Réessayez dans quelques instants.',
    );
  });
});
