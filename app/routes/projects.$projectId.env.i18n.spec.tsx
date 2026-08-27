/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EnvDiffSection } from './projects.$projectId.env';
import { getProjectEnvCopy } from '~/lib/i18n/catalogs/project-env';

afterEach(cleanup);

describe('project environment values i18n audit boundary', () => {
  it('marks raw configuration payloads as user content without altering them', () => {
    const payload = JSON.stringify({
      preferences: { theme: 'dark' },
      deployment: { environment: 'production' },
    });

    render(
      <EnvDiffSection
        rows={[
          {
            key: 'VIBECORE_IDE_SETTINGS_STATE',
            values: { development: payload, preview: undefined, production: undefined },
            differs: true,
          },
        ]}
        copy={getProjectEnvCopy('fr')}
        language="fr"
      />,
    );

    const value = screen.getByTitle(payload);
    expect(value.hasAttribute('data-user-content')).toBe(true);
    expect(value.getAttribute('title')).toBe(payload);
    expect(value.textContent).toBe(payload);
  });
});
