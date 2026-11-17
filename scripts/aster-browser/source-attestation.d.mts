export const productSha: string;
export const proposedRef: string;
export function assertRunIdentity(env: NodeJS.ProcessEnv): void;
export function attestSamePvcSources(env?: NodeJS.ProcessEnv, cwd?: string, cleanup?: boolean): {productSha: string; workflowSha: string; workflowRef: string; harnessManifestHash: string};
