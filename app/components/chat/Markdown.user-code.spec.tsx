/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Markdown } from './Markdown';
import { UserMessage } from './UserMessage';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }) }));
vi.mock('@nanostores/react', () => ({ useStore: () => undefined }));
vi.mock('./Artifact', () => ({
  Artifact: () => <div data-testid="artifact">Artifact</div>,
  openArtifactInWorkbench: vi.fn(),
}));
vi.mock('./CodeBlock', () => ({ CodeBlock: ({ code }: { code: string }) => <pre data-testid="code">{code}</pre> }));
vi.mock('./MermaidBlock', () => ({ MermaidBlock: ({ code }: { code: string }) => <pre>{code}</pre> }));
afterEach(cleanup);

it.each([false, true])('preserves raw user JSX as text (array=%s)', (array) => {
  const source = 'Corrige <Widget title="a > b" /> et <div>bonjour</div>.';

  const { container } = render(
    <UserMessage content={array ? [{ type: 'text', text: source }] : source} parts={undefined} />,
  );
  expect(container.textContent).toContain(source);
  expect(container.querySelector('widget')).toBeNull();
});
it('does not reinterpret user thoughts or internal-looking HTML', () => {
  const source =
    '<think>exemple</think>\n\n<div class="__boltArtifact__" data-message-id="m" data-artifact-id="a"></div>';

  const { container, queryByTestId } = render(<UserMessage content={source} parts={undefined} />);
  expect(container.textContent).toContain('<think>exemple</think>');
  expect(container.textContent).toContain('__boltArtifact__');
  expect(queryByTestId('artifact')).toBeNull();
});
it('preserves explicit user code fences and artifact examples', () => {
  const code = '<boltArtifact id="demo"><boltAction type="file">example</boltAction></boltArtifact>';
  const { getByTestId } = render(<UserMessage content={'```xml\n' + code + '\n```'} parts={undefined} />);
  expect(getByTestId('code').textContent).toContain(code);
});
it('preserves an explicitly requested assistant code example containing the marker string', () => {
  const code = 'const marker = "__boltArtifact__";';
  const { getByTestId } = render(<Markdown html>{'```ts\n' + code + '\n```'}</Markdown>);
  expect(getByTestId('code').textContent).toContain(code);
});
it('renders trusted artifact placeholders through the custom component', () => {
  const { getByTestId } = render(
    <Markdown html>{'<div class="__boltArtifact__" data-message-id="m" data-artifact-id="a"></div>'}</Markdown>,
  );
  expect(getByTestId('artifact')).toBeTruthy();
});
it('keeps script markup inert in user text', () => {
  const source = '<script>window.__unsafe = true</script>';
  const { container } = render(<UserMessage content={source} parts={undefined} />);
  expect(container.textContent).toContain(source);
  expect(container.querySelector('script')).toBeNull();
});

it('keeps inline and long-fenced user protocol examples intact', () => {
  const inline = '`<boltAction type="file">example</boltAction>`';
  const fenced = '````xml\n```\n<boltArtifact id="demo">example</boltArtifact>\n````';
  const { container } = render(<UserMessage content={inline + '\n\n' + fenced} parts={undefined} />);
  expect(container.textContent).toContain('<boltAction type="file">example</boltAction>');
  expect(container.textContent).toContain('<boltArtifact id="demo">example</boltArtifact>');
});
it('does not activate a marker-only div inside an assistant code example', () => {
  const code = '<div class="__boltArtifact__"></div>';
  const { getByTestId, queryByTestId } = render(<Markdown html>{'```html\n' + code + '\n```'}</Markdown>);
  expect(getByTestId('code').textContent).toContain(code);
  expect(queryByTestId('artifact')).toBeNull();
});
it('preserves a complete placeholder quoted as user code', () => {
  const code = '<div class="__boltArtifact__" data-message-id="m" data-artifact-id="a"></div>';

  const { getByTestId, queryByTestId } = render(
    <UserMessage content={'```html\n' + code + '\n```'} parts={undefined} />,
  );
  expect(getByTestId('code').textContent).toContain(code);
  expect(queryByTestId('artifact')).toBeNull();
});

it.each([false, true])('keeps raw protocol examples in user text (array=%s)', (array) => {
  const source =
    'Explique <boltArtifact id="example"><boltAction type="file">code</boltAction></boltArtifact> sans l’exécuter.';
  const { container, queryByTestId } = render(
    <UserMessage content={array ? [{ type: 'text', text: source }] : source} parts={undefined} />,
  );
  expect(container.textContent).toContain(source);
  expect(queryByTestId('artifact')).toBeNull();
});
