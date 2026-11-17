export const stages: readonly string[];
export const statuses: readonly string[];
export function createDiagnostics(write: (line: string) => void): { stage(value: string): void; status(value: string): void };
export const diagnostic: ReturnType<typeof createDiagnostics>;
export function renderDiagnostics(input: unknown): string;
