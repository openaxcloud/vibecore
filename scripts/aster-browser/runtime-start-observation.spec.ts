import { describe, it, expect } from 'vitest';
import { runtimeStartObservation } from './runtime-start-observation.js';
const origin = 'http://127.0.0.1:5173';
describe('real runtime cold-start observation contract', () => {
  it('accepts successful start POST', () => {
    expect(runtimeStartObservation(origin, origin+'/api/runtime/workspaces', 'POST', true)).toBe('post');
  });
  it('accepts successful exact-workspace status after transient POST', () => {
    expect(runtimeStartObservation(origin, origin+'/api/runtime/workspaces', 'POST', false, 'ws-1', 'project-1')).toBeUndefined();
    expect(runtimeStartObservation(origin, origin+'/api/runtime/workspaces/ws-1/status', 'GET', true, 'ws-1', 'project-1')).toBe('status');
  });
  it.each([
    [origin+'/api/runtime/workspaces/ws-other/status', 'GET', true, 'ws-1', 'project-1'],
    [origin+'/api/runtime/workspaces/project-1/status', 'GET', true, 'project-1', 'project-1'],
    [origin+'/api/runtime/workspaces/ws-1/status', 'GET', true, undefined, 'project-1'],
    [origin+'/api/runtime/workspaces/ws-1/status', 'GET', false, 'ws-1', 'project-1'],
    ['http://127.0.0.1:9999/api/runtime/workspaces/ws-1/status', 'GET', true, 'ws-1', 'project-1'],
  ] as const)('rejects unrelated or unsuccessful observation %s', (url, method, ok, workspace, project) => {
    expect(runtimeStartObservation(origin, url, method, ok, workspace, project)).toBeUndefined();
  });
});
