import { describe, expect, it } from 'vitest';

import { createCommandsMessage, detectProjectCommands } from './projectCommands';

describe('project command synthesis i18n', () => {
  it('localizes the generated explanation and artifact title without changing commands', async () => {
    const commands = await detectProjectCommands(
      [
        {
          path: 'package.json',
          content: JSON.stringify({ scripts: { dev: 'vite' }, dependencies: {} }),
        },
      ],
      'fr',
    );

    expect(commands.followupMessage).toContain('Le script « dev » a été trouvé dans package.json.');
    expect(commands.setupCommand).toContain('npm install');
    expect(commands.startCommand).toBe('npm run dev');

    const message = createCommandsMessage(commands, 'fr');
    expect(message?.content).toContain('title="Configuration du projet"');
    expect(message?.content).toContain('<boltAction type="start">npm run dev</boltAction>');
  });
});
