import type { FormEventHandler, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useIdeSettingsFormDraft } from './IdeSettingsDraftState';
import { PanelInput, PanelButton } from '~/components/project-ide/PanelPrimitives';

export interface ProjectMetadataSettings {
  id: string;
  name?: string;
  description?: string;
  gitRepositoryUrl?: string;
  gitDefaultBranch?: string;
}

export function ProjectMetadataForm({
  settings,
  paneId,
  onSubmit,
  busy,
}: {
  settings: ProjectMetadataSettings;
  paneId?: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  busy: boolean;
}) {
  const { t } = useTranslation();

  const metadata = useIdeSettingsFormDraft(settings.id, paneId, {
    'project.name': settings.name ?? '',
    'project.description': settings.description ?? '',
    'project.gitRepositoryUrl': settings.gitRepositoryUrl ?? '',
    'project.gitDefaultBranch': settings.gitDefaultBranch ?? 'main',
  });
  const draft = {
    name: metadata.values['project.name'] ?? '',
    description: metadata.values['project.description'] ?? '',
    gitRepositoryUrl: metadata.values['project.gitRepositoryUrl'] ?? '',
    gitDefaultBranch: metadata.values['project.gitDefaultBranch'] ?? 'main',
  };
  const updateDraft = (key: keyof typeof draft) => (event: ChangeEvent<HTMLInputElement>) => {
    metadata.setField(`project.${key}`, event.target.value);
  };

  return (
    <form onSubmit={onSubmit} className="bolt-project-settings-card">
      <div className="bolt-project-settings-card-title">
        <h4>{t('chat.copy.projectMetadata_fca99c55')}</h4>
        <small>{t('chat.copy.theseFieldsUpdateProjectsIdSettings_cd1c0bbf')}</small>
      </div>
      <label>
        {t('chat.copy.projectName_ab9773fc')}
        <PanelInput
          name="name"
          value={draft.name}
          onChange={updateDraft('name')}
          required
          aria-label={t('chat.copy.projectName_ab9773fc')}
        />
      </label>
      <label>
        {t('chat.copy.description_55f8ebc8')}
        <PanelInput
          name="description"
          value={draft.description}
          onChange={updateDraft('description')}
          aria-label={t('chat.copy.projectDescription_f9e31cfd')}
        />
      </label>
      <label>
        {t('chat.copy.gitRepositoryUrl_fa85202a')}
        <PanelInput
          name="gitRepositoryUrl"
          type="url"
          value={draft.gitRepositoryUrl}
          onChange={updateDraft('gitRepositoryUrl')}
          placeholder={t('chat.copy.httpsGithubComOrgRepo_c3460b93')}
          aria-label={t('chat.copy.gitRepositoryUrl_fa85202a')}
        />
      </label>
      <label>
        {t('chat.copy.defaultBranch_80f8aa6a')}
        <PanelInput
          name="gitDefaultBranch"
          value={draft.gitDefaultBranch}
          onChange={updateDraft('gitDefaultBranch')}
          aria-label={t('chat.copy.defaultGitBranch_f6c17ffb')}
        />
      </label>
      <PanelButton disabled={busy || !draft.name.trim()}>{t('chat.copy.saveSettings_913aba9f')}</PanelButton>
    </form>
  );
}
