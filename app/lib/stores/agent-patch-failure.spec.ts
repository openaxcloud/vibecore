import { expect, it } from 'vitest';
import { describeAgentPatchFailure } from './agent-patch-failure';
import { GeneratedFileJsonError, MissingImportError } from '~/services/agent/post-validate';
import { JsonValidationError } from '~/utils/sanitize-file-content';

it.each([
  [new JsonValidationError('secret-file', new Error('secret-body')), 'json'],
  [new GeneratedFileJsonError('secret-file', new Error('secret-body')), 'json'],
  [new MissingImportError('secret-file', 'secret-import'), 'import'],
  [{ code: 'REMOTE_FILE_CHANGED' }, 'conflict'],
  [{ code: 'AGENT_WRITE_NOT_CONFIRMED', message: 'secret' }, 'confirmation'],
  [{ code: 'EEXIST' }, 'conflict'],
  [{ status: 404, code: 'WORKSPACE_AGENT_CLIENT_ERROR' }, 'missing'],
  [{ status: 403, details: 'secret' }, 'access'],
  [{ status: 503, message: 'secret' }, 'unavailable'],
  [{ code: 'secret', message: 'secret', cause: 'secret' }, 'unknown'],
  ['secret', 'unknown'],
  [null, 'unknown'],
])('classifies without forwarding arbitrary exception data (%j)', (error, reason) => {
  expect(describeAgentPatchFailure(error, 'save')).toEqual({
    stageKey: 'workbenchRuntime.patch.stage.save',
    reasonKey: `workbenchRuntime.patch.reason.${reason}`,
  });
  expect(JSON.stringify(describeAgentPatchFailure(error, 'save'))).not.toContain('secret');
});
