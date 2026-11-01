/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppliedFilesNoticeDock, AppliedFilesNoticeHost } from './AppliedFilesNoticeDock';
import { createI18nInstance } from '~/lib/i18n/runtime';

vi.mock('react-toastify', () => ({
  ToastContainer: ({ containerId }: { containerId: string }) => (
    <section id={containerId}>
      <input aria-label="persistent notice state" defaultValue="original" />
    </section>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('persistent applied-file notice host', () => {
  it('moves the same DOM and focus between a visible dock and the global fallback', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      return (this.hidden ? [] : [{}]) as unknown as DOMRectList;
    });

    const tree = render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AppliedFilesNoticeDock />
        <AppliedFilesNoticeHost />
      </I18nextProvider>,
    );

    const dock = tree.container.querySelector('.bolt-agent-applied-notice-dock') as HTMLElement;
    const input = screen.getByLabelText('persistent notice state') as HTMLInputElement;
    const host = input.closest('.bolt-agent-applied-notice-host')!;
    await waitFor(() => expect(dock.contains(input)).toBe(true));
    expect(document.querySelectorAll('#agent-applied-files-dock')).toHaveLength(1);
    expect(document.querySelectorAll('#agent-applied-files-notices')).toHaveLength(1);
    input.value = 'edited';
    input.focus();
    dock.hidden = true;
    await waitFor(() => expect(host.parentElement).toBe(document.body));
    expect(input.value).toBe('edited');
    expect(document.activeElement).toBe(input);
    dock.hidden = false;
    await waitFor(() => expect(host.parentElement).toBe(dock));
    expect(screen.getByLabelText('persistent notice state')).toBe(input);
    expect(input.value).toBe('edited');
    expect(document.activeElement).toBe(input);
    expect(document.querySelectorAll('.bolt-agent-applied-notice-host')).toHaveLength(1);
    tree.unmount();
    expect(document.querySelectorAll('.bolt-agent-applied-notice-host')).toHaveLength(0);
  });
});
