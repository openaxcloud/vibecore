import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getProjectIdeCopy } from '~/lib/i18n/catalogs/project-ide';

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
    const { i18n } = useTranslation();
    const copy = getProjectIdeCopy(i18n.resolvedLanguage ?? i18n.language);
    const languageServiceDisabled = !hasDocument || !monacoActive;

    return (
      <div className="bolt-project-editor-toolbar">
        <span className="bolt-project-editor-toolbar-file">{fileLabel}</span>
        <div
          className="bolt-project-editor-toolbar-actions"
          role="toolbar"
          aria-label={copy['projectIde.toolbar.ariaLabel']}
        >
          <div
            className="bolt-project-editor-toolbar-group"
            data-toolbar-group="view"
            role="group"
            aria-label={copy['projectIde.toolbar.group.view']}
          >
            <button
              type="button"
              aria-pressed={minimapEnabled}
              title={minimapEnabled ? copy['projectIde.toolbar.minimap.hide'] : copy['projectIde.toolbar.minimap.show']}
              onClick={onToggleMinimap}
              disabled={!hasDocument}
            >
              {copy['projectIde.toolbar.minimap']}
            </button>
          </div>

          <ToolbarDivider />

          <div
            className="bolt-project-editor-toolbar-group"
            data-toolbar-group="navigation"
            role="group"
            aria-label={copy['projectIde.toolbar.group.navigation']}
          >
            <button
              type="button"
              onClick={onGoToDefinition}
              disabled={languageServiceDisabled}
              title={monacoActive ? copy['projectIde.toolbar.definition.title'] : copy['projectIde.toolbar.monacoOnly']}
            >
              {copy['projectIde.toolbar.definition']}
            </button>
            <button
              type="button"
              onClick={onFindReferences}
              disabled={languageServiceDisabled}
              title={monacoActive ? copy['projectIde.toolbar.references.title'] : copy['projectIde.toolbar.monacoOnly']}
            >
              {copy['projectIde.toolbar.references']}
            </button>
          </div>

          <ToolbarDivider />

          <div
            className="bolt-project-editor-toolbar-group"
            data-toolbar-group="editing"
            role="group"
            aria-label={copy['projectIde.toolbar.group.editing']}
          >
            <button type="button" onClick={onFormat} disabled={!hasDocument}>
              {copy['projectIde.toolbar.format']}
            </button>
            <button
              type="button"
              onClick={onRenameSymbol}
              disabled={languageServiceDisabled}
              title={monacoActive ? copy['projectIde.toolbar.rename.title'] : copy['projectIde.toolbar.monacoOnly']}
            >
              {copy['projectIde.toolbar.rename']}
            </button>
            <button
              type="button"
              onClick={onRefactor}
              disabled={languageServiceDisabled}
              title={monacoActive ? copy['projectIde.toolbar.refactor.title'] : copy['projectIde.toolbar.monacoOnly']}
            >
              {copy['projectIde.toolbar.refactor']}
            </button>
          </div>

          <ToolbarDivider />

          <div
            className="bolt-project-editor-toolbar-group"
            data-toolbar-group="save"
            role="group"
            aria-label={copy['projectIde.toolbar.group.save']}
          >
            <button type="button" className="bolt-project-editor-save-button" onClick={onSave} disabled={!hasDocument}>
              {copy['projectIde.toolbar.save']}
            </button>
          </div>
        </div>
      </div>
    );
  },
);

ProjectEditorToolbar.displayName = 'ProjectEditorToolbar';
