import { describe, expect, it, vi } from 'vitest';
import { canAutomaticallyReplayPrompt } from './pending-prompt-budget';

describe('automatic pending prompt budget gate', () => {
  it.each([{ bounded: true }, {}, { bounded: 'false' }, { bounded: false, error: 'private' }])(
    'does not dispatch a generation for bounded or indeterminate state %j',
    async (body) => {
      const transport = vi.fn<typeof fetch>(async () => Response.json(body));
      const append = vi.fn();

      if (await canAutomaticallyReplayPrompt('project', transport)) {
        append();
      }

      expect(append).not.toHaveBeenCalled();
      expect(transport).toHaveBeenCalledOnce();
    },
  );

  it.each(['http', 'network', 'json'])('does not dispatch after a %s failure', async (failure) => {
    const transport = vi.fn<typeof fetch>(async () => {
      if (failure === 'network') {
        throw new Error('synthetic');
      }

      return failure === 'http' ? new Response('', { status: 403 }) : new Response('invalid-json');
    });

    const append = vi.fn();

    if (await canAutomaticallyReplayPrompt('project', transport)) {
      append();
    }

    expect(append).not.toHaveBeenCalled();
  });

  it('allows an authorized unbounded project and encodes the project identifier', async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ bounded: false }));
    const append = vi.fn();

    if (await canAutomaticallyReplayPrompt('project/one', transport)) {
      append();
    }

    expect(append).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledWith(
      '/api/projects/project%2Fone/agent/explicit-run',
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      }),
    );
  });
});
