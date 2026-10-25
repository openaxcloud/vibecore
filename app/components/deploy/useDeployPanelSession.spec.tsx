/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDeployPanelSession } from './useDeployPanelSession';
import { deployPanelSessions } from '~/lib/stores/deploy-panel-view';

afterEach(cleanup);
beforeEach(() => deployPanelSessions.set({}));
describe('deployment panel shell transitions', () => {
  it('retains the selected view and unfinished domain when the desktop shell remounts as mobile', () => {
    const desktop = renderHook(() => useDeployPanelSession('project-a'));
    act(() => desktop.result.current.update({ view: 'domains', domainDraft: 'invalid/path' }));
    desktop.unmount();

    const mobile = renderHook(() => useDeployPanelSession('project-a'));
    expect(mobile.result.current.session).toEqual({ view: 'domains', domainDraft: 'invalid/path' });
  });
  it('isolates project drafts and returns to the original project without losing input', () => {
    const { result, rerender } = renderHook(({ id }) => useDeployPanelSession(id), { initialProps: { id: 'a' } });
    act(() => result.current.update({ view: 'domains', domainDraft: 'a.example.com' }));
    rerender({ id: 'b' });
    expect(result.current.session).toEqual({ view: 'overview', domainDraft: '' });
    act(() => result.current.update({ view: 'logs' }));
    rerender({ id: 'a' });
    expect(result.current.session).toEqual({ view: 'domains', domainDraft: 'a.example.com' });
  });
  it('keeps multiple mounted entries of the same project on one state', () => {
    const first = renderHook(() => useDeployPanelSession('a'));
    const second = renderHook(() => useDeployPanelSession('a'));
    act(() => first.result.current.update({ view: 'domains' }));
    act(() => second.result.current.update({ domainDraft: 'app.example.com' }));
    expect(first.result.current.session).toEqual(second.result.current.session);
    expect(first.result.current.session.view).toBe('domains');
  });
});
