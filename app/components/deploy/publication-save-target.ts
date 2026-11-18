interface DeploymentSource {
  id?: string;
  workspaceId?: string | null;
  provider?: string;
}

/** Return the exact saved workspace target, or null for non-workspace actions. */
export function publicationSaveTarget(
  panel: string,
  form: FormData,
  deployments: DeploymentSource[] = [],
): string | null {
  const intent = String(form.get('intent') ?? 'default');

  if (panel !== 'deployments' || !['default', 'redeploy'].includes(intent)) {
    return null;
  }

  if (intent === 'default') {
    const provider = String(form.get('provider') ?? 'static');

    if (form.get('repositoryUrl') || !['static', 'server'].includes(provider)) {
      return null;
    }

    const workspaceId = String(form.get('workspaceId') ?? '').trim();

    if (!workspaceId) {
      throw new Error('PUBLICATION_SAVE_WORKSPACE_CHANGED');
    }

    return workspaceId;
  }

  const source = deployments.find((entry) => entry.id === form.get('deploymentId'));

  if (!source) {
    throw new Error('PUBLICATION_SAVE_SOURCE_MISSING');
  }

  // External provider hooks rebuild their own repository, not the IDE draft.
  if (source.provider && !['static', 'server'].includes(source.provider)) {
    return null;
  }

  if (!source.workspaceId?.trim()) {
    throw new Error('PUBLICATION_SAVE_LEGACY_TARGET');
  }

  return source.workspaceId;
}
