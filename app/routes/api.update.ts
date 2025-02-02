import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';

interface UpdateRequestBody {
  branch: string;
}

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();

    // Type guard to check if body has the correct shape
    if (!body || typeof body !== 'object' || !('branch' in body) || typeof body.branch !== 'string') {
      return json({ error: 'Invalid request body: branch is required and must be a string' }, { status: 400 });
    }

    const { branch } = body as UpdateRequestBody;

    // Instead of direct Git operations, we'll return instructions
    return json({
      success: true,
      message: 'Please update manually using the following steps:',
      instructions: [
        `1. git fetch origin ${branch}`,
        `2. git pull origin ${branch}`,
        '3. pnpm install',
        '4. pnpm build',
        '5. Restart the application',
      ],
    });
  } catch (error) {
    console.error('Update preparation failed:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while preparing update',
      },
      { status: 500 },
    );
  }
};
