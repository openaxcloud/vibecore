export const PRODUCT_SHA: string;
export interface Fixture { productSha: string; recipe: string; api: string; web: string; projectId: string; workspaceId: string; userId: string; token: string; }
export function loopback(value: string | undefined, protocol?: string): string;
export function optIn(env?: NodeJS.ProcessEnv): void;
export function exactProduct(cwd?: string): void;
export function readFixture(path: string | undefined): Fixture;
export function assertOwnedJob(job: unknown, fixture: Fixture): void;
export function staticSurface(path: string, method?: string, scope?: {projectId: string;workspaceId: string}): 'api' | 'web';
export function ownedRecipe(name: string, web: string, env?: NodeJS.ProcessEnv): void;
