import { memo } from 'react';

interface ProjectEditorToolbarProps {
  fileLabel: string;
  hasDocument: boolean;
  minimapEnabled: boolean;

  /*
   * Definition / References / Rename / Refactor are backed by Monaco language
   * services (editor.action.revealDefinition etc.). The CodeMirror editor used
   * on smaller layouts has no equivalent, so those buttons would be silent
   * no-ops there. When Monaco is not the active editor we disable them and
   * explain why via the tooltip instead of letting clicks do nothing.
   */
  monacoActive?: boolean;
  onToggleMinimap: () => void;
  onFormat: () => void;
  onGoToDefinition: () => void;
  onFindReferences: () => void;
  onRenameSymbol: () => void;
  onRefactor: () => void;
  onSave: () => void;
}

const MONACO_ONLY_HINT = 'Available with Monaco editor';

function ToolbarDivider() {
  return <span className="bolt-project-editor-toolbar-divider" aria-hidden="true" />;
}

export const ProjectEditorToolbar = memo(
  ({
    fileLabel,
    hasDocument,
    minimapEnabled,
    monacoActive = true,
    onToggleMinimap,
    onFormat,
    onGoToDefinition,
    onFindReferences,
    onRenameSymbol,
    onRefactor,
    onSave,
  }: ProjectEditorToolbarProps) => {
    const languageServiceDisabled = !hasDocument || !monacoActive;

    return (
      <div className="bolt-project-editor-toolbar">
        <span className="bolt-project-editor-toolbar-file">{fileLabel}</span>
        <div className="bolt-project-editor-toolbar-actions" role="toolbar" aria-label="Editor actions">
          <div className="bolt-project-editor-toolbar-group" data-toolbar-group="view" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={minimapEnabled}
              title={minimapEnabled ? 'Hide minimap' : 'Show minimap'}
              onClick={onToggleMinimap}
              disabled={!hasDocument}
            >
              Minimap
            </button>
          </div>

          <ToolbarDivider />

          <div
            className="bolt-project-editor-toolbar-group"
            data-toolbar-group="navigation"
            role="group"
            aria-label="Navigation"
          >
            <button
              type="button"
              onClick={onGoToDefinition}
              disabled={languageServiceDisabled}
              title={monacoActive ? 'Go to definition' : MONACO_ONLY_HINT}
            >
              Definition
            </button>
            <button
              type="button"
              onClick={onFindReferences}
              disabled={languageServiceDisabled}
              title={monacoActive ? 'Find references' : MONACO_ONLY_HINT}
            >
              References
            </button>
          </div>

          <ToolbarDivider />

          <div
            className="bolt-project-editor-toolbar-group"
            data-toolbar-group="editing"
            role="group"
            aria-label="Editing"
          >
            <button type="button" onClick={onFormat} disabled={!hasDocument}>
              Format
            </button>
            <button
              type="button"
              onClick={onRenameSymbol}
              disabled={languageServiceDisabled}
              title={monacoActive ? 'Rename symbol' : MONACO_ONLY_HINT}
            >
              Rename
            </button>
            <button
              type="button"
              onClick={onRefactor}
              disabled={languageServiceDisabled}
              title={monacoActive ? 'Open refactor menu' : MONACO_ONLY_HINT}
            >
              Refactor
            </button>
          </div>

          <ToolbarDivider />

          <div className="bolt-project-editor-toolbar-group" data-toolbar-group="save" role="group" aria-label="Save">
            <button type="button" className="bolt-project-editor-save-button" onClick={onSave} disabled={!hasDocument}>
              Save
            </button>
          </div>
        </div>
      </div>
    );
  },
);

ProjectEditorToolbar.displayName = 'ProjectEditorToolbar';
