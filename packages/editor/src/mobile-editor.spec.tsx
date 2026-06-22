/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MobileCodeEditor } from './index.js';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });

  Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value: () => [{ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 }],
  });
});

afterEach(() => {
  cleanup();
});

function editorContent(container: HTMLElement) {
  const content = container.querySelector<HTMLElement>('.cm-content');
  expect(content).toBeTruthy();

  return content!;
}

describe('MobileCodeEditor document sync', () => {
  it('preserves local edits when the file path resolves after typing starts', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <MobileCodeEditor value="export const value = 1;" filePath={undefined} onChange={onChange} />,
    );
    const content = editorContent(container);

    content.focus();
    fireEvent.keyDown(content, { key: 'x' });
    expect(content.textContent).toContain('x');

    rerender(<MobileCodeEditor value="export const value = 1;" filePath="src/App.tsx" onChange={onChange} />);

    expect(content.textContent).toContain('x');
  });

  it('accepts whitespace and newline as the first mobile keystrokes', () => {
    const onChange = vi.fn();
    const { container } = render(
      <MobileCodeEditor value="export const value = 1;" filePath="src/App.tsx" onChange={onChange} />,
    );
    const content = editorContent(container);

    content.focus();
    fireEvent.keyDown(content, { key: ' ' });
    fireEvent.keyDown(content, { key: 'Enter' });
    fireEvent.keyDown(content, { key: '/' });
    fireEvent.keyDown(content, { key: '/' });
    fireEvent.keyDown(content, { key: ' ' });
    fireEvent.keyDown(content, { key: 'm' });

    expect(content.textContent).toContain('// m');
    expect(onChange).toHaveBeenCalled();
  });

  it('does not overwrite a fresh local draft with a stale upstream value', () => {
    const onChange = vi.fn();
    const initialValue = 'export const value = 1;';
    const { container, rerender } = render(
      <MobileCodeEditor value={initialValue} filePath="src/App.tsx" onChange={onChange} />,
    );
    const content = editorContent(container);

    content.focus();
    fireEvent.keyDown(content, { key: 'x' });

    const localValue = onChange.mock.lastCall?.[0]?.value as string | undefined;
    expect(localValue).toContain('x');

    rerender(<MobileCodeEditor value={localValue!} filePath="src/App.tsx" onChange={onChange} />);
    rerender(<MobileCodeEditor value={initialValue} filePath="src/App.tsx" onChange={onChange} />);

    expect(content.textContent).toContain('x');
  });

  it('still applies a real file switch after a local edit', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <MobileCodeEditor value="export const value = 1;" filePath="src/App.tsx" onChange={onChange} />,
    );
    const content = editorContent(container);

    content.focus();
    fireEvent.keyDown(content, { key: 'x' });
    expect(content.textContent).toContain('x');

    rerender(<MobileCodeEditor value="body { color: red; }" filePath="src/styles.css" onChange={onChange} />);

    expect(content.textContent).toContain('body { color: red; }');
    expect(content.textContent).not.toContain('x');
  });
});

describe('MobileCodeEditor dotenv masking', () => {
  it('does not render dotenv secret values in cleartext', () => {
    /*
     * The caret defaults to the start of the document, so line 1 is revealed
     * for editing; place the secret on a later line to assert masking.
     */
    const { container } = render(
      <MobileCodeEditor value={'PUBLIC_URL=https://app.example\nAPI_KEY=sk-live-supersecret'} filePath=".env" />,
    );
    const content = editorContent(container);

    /* The non-caret secret value must never appear as readable text in the DOM. */
    expect(content.textContent).not.toContain('sk-live-supersecret');

    /* A masked-secret widget should be rendered in its place. */
    expect(container.querySelector('.cm-masked-secret')).toBeTruthy();
  });

  it('renders non-dotenv files in plaintext (no masking)', () => {
    const { container } = render(
      <MobileCodeEditor value={'const apiKey = "sk-live-supersecret";'} filePath="src/config.ts" />,
    );
    const content = editorContent(container);

    expect(content.textContent).toContain('sk-live-supersecret');
    expect(container.querySelector('.cm-masked-secret')).toBeNull();
  });
});
