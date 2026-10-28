/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainValue } from './DeploymentOverview';
import { createI18nInstance } from '~/lib/i18n/runtime';

vi.mock('react-qrcode-logo', () => ({ QRCode: () => null }));

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
afterEach(() => {
  cleanup();
  vi.useRealTimers();

  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard);
  } else {
    Reflect.deleteProperty(navigator, 'clipboard');
  }
});

function setup(url = 'https://isolated.example.test', language: 'en' | 'fr' = 'en') {
  const i18n = createI18nInstance(language);

  const view = render(
    <I18nextProvider i18n={i18n}>
      <DomainValue url={url} />
    </I18nextProvider>,
  );

  return {
    ...view,
    changeUrl: (next: string) =>
      view.rerender(
        <I18nextProvider i18n={i18n}>
          <DomainValue url={next} />
        </I18nextProvider>,
      ),
  };
}

describe('deployment URL clipboard feedback', () => {
  it('explains a rejected clipboard write and keeps the URL available', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) },
    });
    setup();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy URL' })));
    expect(screen.getByRole('status').textContent).toMatch(/copy.*manually/i);
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://isolated.example.test');
    expect(screen.queryByRole('button', { name: 'URL copied' })).toBeNull();

    const fallback = screen.getByRole('textbox', { name: 'Copy URL' }) as HTMLInputElement;
    expect(fallback.value).toBe('https://isolated.example.test');
    fireEvent.focus(fallback);
    expect(fallback.selectionStart).toBe(0);
    expect(fallback.selectionEnd).toBe(fallback.value.length);
  });

  it('provides a French manual-copy instruction when clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    setup(undefined, 'fr');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /copier/i })));
    expect(screen.getByRole('status').textContent).toMatch(/manuellement/i);
  });

  it('does not report an old URL as copied after the displayed URL changes', async () => {
    let resolve!: () => void;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(
          () =>
            new Promise<void>((done) => {
              resolve = done;
            }),
        ),
      },
    });

    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }));
    view.changeUrl('https://another.example.test');
    await act(async () => resolve());
    expect(screen.queryByRole('button', { name: 'URL copied' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy URL' })).toBeTruthy();
  });

  it('clears manual-copy feedback after a successful retry with the exact URL', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    setup();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy URL' })));
    expect(screen.getByRole('textbox')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy URL' })));
    expect(writeText).toHaveBeenNthCalledWith(2, 'https://isolated.example.test');
    expect(screen.getByRole('status').textContent).toBe('URL copied');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('ignores an older rejected attempt after a newer copy succeeded', async () => {
    let reject!: (error: Error) => void;

    const writeText = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy URL' })));
    await act(async () => reject(new Error('Older request failed')));
    expect(screen.getByRole('status').textContent).toBe('URL copied');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps feedback for a recent copy when an earlier copy would have expired', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    setup();
    vi.useFakeTimers();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy URL' })));
    act(() => vi.advanceTimersByTime(1000));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'URL copied' })));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('status').textContent).toBe('URL copied');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
