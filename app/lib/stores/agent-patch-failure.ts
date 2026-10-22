import type { WorkbenchRuntimeKey } from '~/lib/i18n/catalogs/workbench-runtime';
import { GeneratedFileJsonError, MissingImportError } from '~/services/agent/post-validate';
import { JsonValidationError } from '~/utils/sanitize-file-content';

export type AgentPatchApplyStage = 'diff' | 'validation' | 'save' | 'runtime' | 'confirmation';

/**
 * Only fixed classifications reach UI/server logs. Exception messages, URLs,
 * response bodies and arbitrary codes can contain credentials or generated data.
 */
export function describeAgentPatchFailure(
  error: unknown,
  stage: AgentPatchApplyStage,
): { stageKey: WorkbenchRuntimeKey; reasonKey: WorkbenchRuntimeKey } {
  const failure = error && typeof error === 'object' ? error : {};
  const code = 'code' in failure ? failure.code : undefined;
  const status = 'status' in failure ? failure.status : undefined;

  let reasonKey: WorkbenchRuntimeKey = 'workbenchRuntime.patch.reason.unknown';

  if (code === 'AGENT_WRITE_NOT_CONFIRMED') {
    reasonKey = 'workbenchRuntime.patch.reason.confirmation';
  } else if (error instanceof GeneratedFileJsonError || error instanceof JsonValidationError) {
    reasonKey = 'workbenchRuntime.patch.reason.json';
  } else if (error instanceof MissingImportError) {
    reasonKey = 'workbenchRuntime.patch.reason.import';
  } else if (code === 'REMOTE_FILE_CHANGED' || code === 'EEXIST' || status === 409) {
    reasonKey = 'workbenchRuntime.patch.reason.conflict';
  } else if (code === 'ENOENT' || (status === 404 && code === 'WORKSPACE_AGENT_CLIENT_ERROR')) {
    reasonKey = 'workbenchRuntime.patch.reason.missing';
  } else if (status === 401 || status === 403) {
    reasonKey = 'workbenchRuntime.patch.reason.access';
  } else if (status === 425 || status === 429 || status === 502 || status === 503 || status === 504) {
    reasonKey = 'workbenchRuntime.patch.reason.unavailable';
  }

  return { stageKey: `workbenchRuntime.patch.stage.${stage}`, reasonKey };
}
