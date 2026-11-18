export const browserStages: readonly string[];
export const browserStatuses: readonly string[];
export function readBrowserCheckpoint(path: string | undefined): [string, string] | undefined;
export function writeBrowserCheckpoint(stage: string, status?: string, path?: string): void;
export function failBrowserCheckpoint(status?: string, path?: string): void;
export function relayBrowserCheckpoint(path: string, diagnostic: { stage(value: string): void; status(value: string): void }): void;
