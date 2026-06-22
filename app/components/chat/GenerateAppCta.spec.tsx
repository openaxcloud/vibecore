/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenerateAppCta } from './GenerateAppCta';
import type { FileMap } from '~/lib/stores/files';

afterEach(cleanup);

const aiReadme: FileMap = {
  '/home/project/README.md': {
    type: 'file',
    content: 'This project was created from an AI prompt.\n\nPrompt:\n\nBuild a todo app with React.',
    isBinary: false,
  },
};

describe('GenerateAppCta', () => {
  it('renders a Generate app button for a README-only project and sends the recovered prompt', () => {
    const onGenerate = vi.fn();
    render(<GenerateAppCta files={aiReadme} hasMessages={false} isGenerating={false} onGenerate={onGenerate} />);

    const button = screen.getByRole('button', { name: /generate app/i });
    fireEvent.click(button);
    expect(onGenerate).toHaveBeenCalledWith('Build a todo app with React.');
  });

  it('renders nothing once a conversation has started', () => {
    const { container } = render(
      <GenerateAppCta files={aiReadme} hasMessages isGenerating={false} onGenerate={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while the agent is generating', () => {
    const { container } = render(
      <GenerateAppCta files={aiReadme} hasMessages={false} isGenerating onGenerate={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing once real app files exist', () => {
    const generated: FileMap = {
      ...aiReadme,
      '/home/project/src/App.tsx': { type: 'file', content: 'export default null;', isBinary: false },
    };
    const { container } = render(
      <GenerateAppCta files={generated} hasMessages={false} isGenerating={false} onGenerate={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
