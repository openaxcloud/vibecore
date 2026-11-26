export type PublicationSaveCode =
  | 'PUBLICATION_SAVE_WORKSPACE_CHANGED'
  | 'PUBLICATION_SAVE_SOURCE_MISSING'
  | 'PUBLICATION_SAVE_LEGACY_TARGET'
  | 'PUBLICATION_SAVE_SCOPE_CHANGED'
  | 'PUBLICATION_SAVE_RESTORE_IN_PROGRESS'
  | 'PUBLICATION_FILES_NOT_SAVED';

/** Internal control-flow code only; the publication UI selects localized copy. */
export class PublicationSaveError extends Error {
  constructor(readonly code: PublicationSaveCode) {
    super();
  }
}
