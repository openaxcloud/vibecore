import { describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- this unit test exercises a standalone capture-script module.
import {
  buildRuntimePreviewProvenance,
  isNativeWebviewFallbackEligible,
  selectOfficialRuntimePreviewUrl,
} from '../../scripts/solution-runtime-preview-proof';

describe('official E-Code runtime preview proof', () => {
  it('selects only a ready allowlisted HTTPS preview URL on the requested port', () => {
    const selected = selectOfficialRuntimePreviewUrl([
      { port: 5173, ready: false, url: 'https://stale.preview.e-code.ai/' },
      { port: 4173, ready: true, url: 'https://wrong-port.preview.e-code.ai/' },
      { port: 5173, ready: true, url: 'https://workspace-123.preview.e-code.ai/app' },
    ]);

    expect(selected).toBe('https://workspace-123.preview.e-code.ai/app');
  });

  it.each([
    'http://workspace.preview.e-code.ai/',
    'https://workspace.preview.e-code.ai.evil.test/',
    'https://preview.e-code.ai.evil.test/',
    'https://user:secret@workspace.preview.e-code.ai/',
    'not a URL',
  ])('rejects a non-official runtime candidate: %s', (url) => {
    expect(selectOfficialRuntimePreviewUrl([{ port: 5173, ready: true, url }])).toBeUndefined();
  });

  it('records direct fallback provenance without exposing the full runtime URL', () => {
    const provenance = buildRuntimePreviewProvenance({
      mode: 'official-runtime-direct',
      nativeFallbackReason: 'native iframe remained about:blank',
      officialRuntimeUrl: 'https://workspace-123.preview.e-code.ai/app?opaque=secret',
      runtimeStatus: 'RUNNING',
      workspaceId: 'ws-123',
    });

    expect(provenance).toMatchObject({
      capturePolicy: 'native-preferred-official-runtime-direct-fallback',
      mode: 'official-runtime-direct',
      nativeFallbackReason: 'native iframe remained about:blank',
      officialRuntimeOrigin: 'https://workspace-123.preview.e-code.ai',
      port: 5173,
      runtimeStatus: 'running',
      workspaceId: 'ws-123',
    });
    expect(JSON.stringify(provenance)).not.toContain('opaque=secret');
    expect(provenance.officialRuntimeUrlSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('allows direct proof only for native attachment/blankness failures, never app runtime errors', () => {
    expect(isNativeWebviewFallbackEligible('The native Webview stayed empty after refresh')).toBe(true);
    expect(isNativeWebviewFallbackEligible('The native Webview iframe did not attach after terminal recovery')).toBe(
      true,
    );
    expect(
      isNativeWebviewFallbackEligible('Preview contains a runtime error: Vite error failed to resolve import'),
    ).toBe(false);
    expect(isNativeWebviewFallbackEligible('The IDE shell is disconnected')).toBe(false);
  });

  it('refuses to label an invalid workspace or native-failure-free direct capture as proof', () => {
    expect(() =>
      buildRuntimePreviewProvenance({
        mode: 'official-runtime-direct',
        officialRuntimeUrl: 'https://workspace-123.preview.e-code.ai/',
        runtimeStatus: 'running',
        workspaceId: 'ws-123',
      }),
    ).toThrow(/native Webview failure reason/);

    expect(() =>
      buildRuntimePreviewProvenance({
        mode: 'native-webview',
        runtimeStatus: 'stopped',
        workspaceId: 'ws-123',
      }),
    ).toThrow(/running workspace/);
  });
});
