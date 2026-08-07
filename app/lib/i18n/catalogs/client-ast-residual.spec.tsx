/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clientAstResidualEn,
  clientAstResidualFr,
  formatClientAstResidualCopy,
  formatClientAstResidualPlural,
  formatClientAstStorage,
  getClientAstResidualCopy,
} from './client-ast-residual';
import FilePreview from '~/components/chat/FilePreview';
import { PresenceAvatars } from '~/components/chat/PresenceAvatars';
import { SendButton } from '~/components/chat/SendButton.client';
import { decideImageAttachment, MAX_IMAGE_ATTACHMENT_BYTES } from '~/components/chat/image-attachments';
import { FilterChip } from '~/components/ui/FilterChip';
import { RangeSlider } from '~/components/ui/RangeSlider';

const renderedSources = [
  '../../../components/@settings/tabs/netlify/NetlifyTab.tsx',
  '../../../components/@settings/tabs/supabase/SupabaseTab.tsx',
  '../../../components/chat/FilePreview.tsx',
  '../../../components/chat/PresenceAvatars.tsx',
  '../../../components/chat/SendButton.client.tsx',
  '../../../components/chat/image-attachments.ts',
  '../../../components/chat/Chat.client.tsx',
  '../../../components/dashboard/SaaSLayout.tsx',
  '../../../components/deploy/GitHubDeploymentDialog.tsx',
  '../../../components/deploy/NetlifyDeploy.client.tsx',
  '../../../components/git/GitTab.tsx',
  '../../../components/ui/FilterChip.tsx',
  '../../../components/ui/RangeSlider.tsx',
  '../../../components/ui/ThemeSwitch.tsx',
] as const;

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

async function createTestI18n(language: 'en' | 'fr') {
  const i18n = createInstance();

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: {} },
      fr: { translation: {} },
    },
    lng: language,
    fallbackLng: 'en',
    initImmediate: false,
  });

  return i18n;
}

describe('client AST residual catalog', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps complete typed EN/FR resources with matching interpolation tokens', () => {
    expect(Object.keys(clientAstResidualFr)).toEqual(Object.keys(clientAstResidualEn));

    for (const key of Object.keys(clientAstResidualEn) as Array<keyof typeof clientAstResidualEn>) {
      expect(clientAstResidualEn[key].trim().length, key).toBeGreaterThan(0);
      expect(clientAstResidualFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(clientAstResidualFr[key]), key).toEqual(interpolationTokens(clientAstResidualEn[key]));
    }
  });

  it('falls back to English and preserves approved technical identifiers', () => {
    expect(getClientAstResidualCopy('de-DE')).toBe(clientAstResidualEn);
    expect(getClientAstResidualCopy('fr-CA')).toBe(clientAstResidualFr);
    expect(clientAstResidualFr['clientAst.git.detachedHead']).toBe('HEAD @ {branch}');
    expect(clientAstResidualFr['clientAst.deploy.netlify.statusCheckFailed']).toContain('HTTP');
    expect(clientAstResidualFr['clientAst.deploy.github.initialCommit']).toContain('E-Code');
  });

  it('formats French numbers, storage units, interpolation, and plurals', () => {
    expect(formatClientAstStorage(1234.5, 'MB', 'fr')).toBe('1 234,5 MB');
    expect(formatClientAstStorage(2, 'GB', 'en')).toBe('2 GB');
    expect(
      formatClientAstResidualCopy(clientAstResidualFr['clientAst.settings.supabase.selectProject'], {
        project: 'Customer API English',
      }),
    ).toBe('Sélectionner le projet Customer API English');
    expect(
      formatClientAstResidualPlural('fr', 1, {
        one: clientAstResidualFr['clientAst.chat.presence.viewers_one'],
        other: clientAstResidualFr['clientAst.chat.presence.viewers_other'],
      }),
    ).toBe('1 personne consulte');
    expect(
      formatClientAstResidualPlural('fr', 1200, {
        one: clientAstResidualFr['clientAst.chat.presence.viewers_one'],
        other: clientAstResidualFr['clientAst.chat.presence.viewers_other'],
      }),
    ).toBe('1 200 personnes consultent');
  });

  it('localizes attachment validation without changing the 5MB technical limit', () => {
    const countDecision = decideImageAttachment({
      fileSizeBytes: 1,
      currentAttachmentCount: 4,
      language: 'fr',
    });
    const sizeDecision = decideImageAttachment({
      fileSizeBytes: MAX_IMAGE_ATTACHMENT_BYTES + 1,
      currentAttachmentCount: 0,
      language: 'fr',
    });

    expect(countDecision).toEqual({
      action: 'reject',
      reason: 'attachment-limit',
      message: 'Vous pouvez joindre au maximum 4 images par message.',
    });
    expect(sizeDecision).toEqual({
      action: 'reject',
      reason: 'file-too-large',
      message: 'Les images ne doivent pas dépasser 5MB.',
    });
  });

  it('switches visible and accessible copy from French to English without remounting', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe() {
          return undefined;
        }
        unobserve() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      },
    );

    const i18n = await createTestI18n('fr');
    const file = new File(['user content'], 'README English API_URL.md', { type: 'text/markdown' });

    render(
      <I18nextProvider i18n={i18n}>
        <SendButton show />
        <PresenceAvatars
          maxVisible={1}
          entries={[
            { userId: 'one', name: 'Alice English', status: 'typing', lastSeenAt: 1 },
            { userId: 'two', name: 'Bob API_URL', status: 'viewing', lastSeenAt: 1 },
          ]}
        />
        <FilePreview files={[file]} imageDataList={[]} onRemove={() => undefined} />
        <FilterChip label="Owner API_URL" onRemove={() => undefined} />
        <RangeSlider defaultValue={[50]} />
      </I18nextProvider>,
    );

    expect(screen.getByRole('button', { name: 'Envoyer le message' }).getAttribute('title')).toBe('Envoyer le message');
    expect(screen.getByRole('group', { name: '2 personnes consultent' })).toBeTruthy();
    expect(screen.getByLabelText('Alice English — saisie en cours')).toBeTruthy();
    expect(screen.getByLabelText('1 personne supplémentaire')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirer README English API_URL.md' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirer le filtre Owner API_URL' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Valeur du curseur' })).toBeTruthy();

    await act(async () => i18n.changeLanguage('en'));

    expect(screen.getByRole('button', { name: 'Send message' }).getAttribute('title')).toBe('Send message');
    expect(screen.getByRole('group', { name: '2 viewers' })).toBeTruthy();
    expect(screen.getByLabelText('Alice English typing')).toBeTruthy();
    expect(screen.getByLabelText('1 more viewer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove README English API_URL.md' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Owner API_URL filter' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Slider value' })).toBeTruthy();
  });

  it('leaves zero current AST scanner findings in every owned source', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    for (const relativePath of renderedSources) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      const result = scanSource(source, relativePath);

      expect(result.parseErrors, relativePath).toEqual([]);
      expect(result.findings, relativePath).toEqual([]);
    }
  });
});
