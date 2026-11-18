export const stages: readonly string[];
export function diagnostic(value: unknown): {kind: string; stage: string; status: string; failure: string}|null;
export function emitDiagnostic(stage: string,status: string,failure?: string): void;
export function failureCode(error: unknown): string;
export function relayDiagnostics(write?: (value: unknown)=>void): (chunk: string|Buffer)=>void;
