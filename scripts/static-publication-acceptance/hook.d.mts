import type { recipeManifests } from '../private-runtime-recipe/manifests.js';
export const STATIC_REF: string;
export function staticEvent(env: NodeJS.ProcessEnv): void;
export function staticResources(resources: ReturnType<typeof recipeManifests>): ReturnType<typeof recipeManifests>;
export function runStaticAcceptance(input: {name: string; directory: string; kubeconfig: string; managerSecret: string; browsers: string; path: string}): Promise<void>;
