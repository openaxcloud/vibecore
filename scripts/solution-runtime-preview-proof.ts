import { createHash } from 'node:crypto';

export type OfficialRuntimePort = {
  port?: number;
  ready?: boolean;
  url?: string;
};

export type PreviewProofMode = 'native-webview' | 'official-runtime-direct';

export type RuntimePreviewProvenance = {
  capturePolicy: 'native-preferred-official-runtime-direct-fallback';
  gates: {
    generatedSourcesUnwrapped: true;
    officialDocumentOk: true | 'not-applicable';
    officialUrlAllowlisted: true | 'not-applicable';
    persistedRuntimeParity: true;
    renderedIdentity: true;
    renderedNonBlank: true;
    runtimeRunning: true;
    visualSubstance: true;
  };
  mode: PreviewProofMode;
  nativeFallbackReason?: string;
  officialRuntimeOrigin?: string;
  officialRuntimeUrlSha256?: string;
  port: number;
  runtimeStatus: 'running';
  workspaceId: string;
};

export function selectOfficialRuntimePreviewUrl(ports: readonly OfficialRuntimePort[], port = 5173) {
  const candidate = ports.find(
    (entry) => entry.port === port && entry.ready === true && typeof entry.url === 'string',
  )?.url;

  if (!candidate) {
    return undefined;
  }

  try {
    const parsed = new URL(candidate);

    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      !parsed.hostname.endsWith('.preview.e-code.ai')
    ) {
      return undefined;
    }

    return parsed.href;
  } catch {
    return undefined;
  }
}

export function isNativeWebviewFallbackEligible(reason: string) {
  const normalized = reason.replace(/\s+/g, ' ').trim();

  return (
    /(?:native\s+(?:preview|webview)|webview\s+iframe|reloaded\s+ide).*(?:empty|blank|did\s+not\s+attach|attach\s+a\s+non-blank|render\s+substantial)/i.test(
      normalized,
    ) &&
    !/internal server error|failed to resolve import|cannot find module|vite error|unexpected token|uncaught typeerror|plugin:vite/i.test(
      normalized,
    )
  );
}

export function buildRuntimePreviewProvenance(input: {
  mode: PreviewProofMode;
  nativeFallbackReason?: string;
  officialRuntimeUrl?: string;
  port?: number;
  runtimeStatus: string | undefined;
  workspaceId: string | undefined;
}): RuntimePreviewProvenance {
  if (!input.workspaceId) {
    throw new Error('Runtime preview provenance requires an official E-Code workspace id');
  }

  if (input.runtimeStatus?.toLocaleLowerCase() !== 'running') {
    throw new Error(
      `Runtime preview provenance requires a running workspace, received ${input.runtimeStatus ?? 'unavailable'}`,
    );
  }

  const port = input.port ?? 5173;

  const officialRuntimeUrl = input.officialRuntimeUrl
    ? selectOfficialRuntimePreviewUrl([{ port, ready: true, url: input.officialRuntimeUrl }], port)
    : undefined;

  if (input.mode === 'official-runtime-direct' && !officialRuntimeUrl) {
    throw new Error('Direct runtime preview provenance requires an allowlisted official E-Code runtime URL');
  }

  if (input.mode === 'official-runtime-direct' && !input.nativeFallbackReason?.trim()) {
    throw new Error('Direct runtime preview provenance requires the native Webview failure reason');
  }

  return {
    capturePolicy: 'native-preferred-official-runtime-direct-fallback',
    gates: {
      generatedSourcesUnwrapped: true,
      officialDocumentOk: input.mode === 'official-runtime-direct' ? true : 'not-applicable',
      officialUrlAllowlisted: input.mode === 'official-runtime-direct' ? true : 'not-applicable',
      persistedRuntimeParity: true,
      renderedIdentity: true,
      renderedNonBlank: true,
      runtimeRunning: true,
      visualSubstance: true,
    },
    mode: input.mode,
    ...(input.nativeFallbackReason ? { nativeFallbackReason: input.nativeFallbackReason.trim() } : {}),
    ...(officialRuntimeUrl
      ? {
          officialRuntimeOrigin: new URL(officialRuntimeUrl).origin,
          officialRuntimeUrlSha256: createHash('sha256').update(officialRuntimeUrl).digest('hex'),
        }
      : {}),
    port,
    runtimeStatus: 'running',
    workspaceId: input.workspaceId,
  };
}
