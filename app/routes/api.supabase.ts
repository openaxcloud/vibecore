import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';
import type { SupabaseProject } from '~/types/supabase';

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Inside the action function
  try {
    const { token } = (await request.json()) as any;

    const projectsResponse = await fetch('https://api.supabase.com/v1/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!projectsResponse.ok) {
      const errorText = await projectsResponse.text();
      console.error('Projects fetch failed:', errorText);

      return json({ error: 'Failed to fetch projects' }, { status: 401 });
    }

    const projects = (await projectsResponse.json()) as SupabaseProject[];

    // Create a Map to store unique projects by ID
    const uniqueProjectsMap = new Map<string, SupabaseProject>();

    // Only keep the latest version of each project
    for (const project of projects) {
      if (!uniqueProjectsMap.has(project.id)) {
        uniqueProjectsMap.set(project.id, project);
      }
    }

    // Debug log to see unique projects
    console.log(
      'Unique projects:',
      Array.from(uniqueProjectsMap.values()).map((p) => ({ id: p.id, name: p.name })),
    );

    const uniqueProjects = Array.from(uniqueProjectsMap.values());

    // Sort projects by creation date (newest first)
    uniqueProjects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return json({
      user: { email: 'Connected', role: 'Admin' },
      stats: {
        projects: uniqueProjects,
        totalProjects: uniqueProjects.length,
      },
    });
  } catch (error) {
    console.error('Supabase API error:', error);
    return json(
      {
        error: error instanceof Error ? error.message : 'Authentication failed',
      },
      { status: 401 },
    );
  }
};
