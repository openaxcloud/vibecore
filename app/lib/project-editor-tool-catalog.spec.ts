import { describe, expect, it } from 'vitest';
import { PROJECT_EDITOR_TOOLS } from './project-editor-layout';
import { PROJECT_EDITOR_TOOL_CATALOG, projectEditorToolMetadata } from './project-editor-tool-catalog';

describe('Project Editor tool catalog', () => {
  it('covers every canonical tool exactly once and in canonical order', () => {
    const catalogIds = PROJECT_EDITOR_TOOL_CATALOG.map((tool) => tool.id);

    expect(catalogIds).toEqual(PROJECT_EDITOR_TOOLS);
    expect(new Set(catalogIds).size).toBe(PROJECT_EDITOR_TOOLS.length);
  });

  it('provides complete searchable metadata for every All Tools and Add tab entry', () => {
    for (const tool of PROJECT_EDITOR_TOOL_CATALOG) {
      expect(tool.title.trim(), `${tool.id} title`).not.toBe('');
      expect(tool.description.trim(), `${tool.id} description`).not.toBe('');
      expect(tool.icon, `${tool.id} icon`).toMatch(/^i-/);
      expect(tool.category.trim(), `${tool.id} category`).not.toBe('');
      expect(projectEditorToolMetadata(tool.id)).toEqual(tool);
    }
  });

  it('includes tools that were missing from the former duplicated palettes', () => {
    expect(projectEditorToolMetadata('studio').title).toBe('Agent Studio');
    expect(projectEditorToolMetadata('domains').title).toBe('Domains');
  });
});
