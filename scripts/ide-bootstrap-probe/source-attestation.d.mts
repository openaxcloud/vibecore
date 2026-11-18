export const productSha: string;
export const launchBase: string;
export const proposedRef: string;
export const reviewedOverlay: string[];
export const launchPaths: string[];
export function assertRunIdentity(env: NodeJS.ProcessEnv, event?: unknown): void;
export function assertSource(env?: NodeJS.ProcessEnv): string;
export function attestProbeSources(env?: NodeJS.ProcessEnv,cwd?: string,cleanup?: boolean): unknown;
