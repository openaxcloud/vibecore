export const PROBE_REF: string;
export function probeEvent(env: NodeJS.ProcessEnv): void;
export function runIdeProbe(input: {name: string; directory: string; kubeconfig: string; browsers: string; path: string}): Promise<void>;
