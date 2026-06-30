import { type ActionFunctionArgs, type LoaderFunctionArgs, data as json } from 'react-router';
import { preferredConnectorToken } from '~/lib/connectors/connector-token.server';
import { resolveVercelPollOutcome } from '~/lib/vercel-deploy-poll';
import { isValidVercelProjectId } from '~/lib/vercel-project-id';
import { buildVercelProjectName } from '~/lib/vercel-project-name';
import type { VercelProjectInfo } from '~/types/vercel';

/*
 * All outbound Vercel API calls go through this so a hung upstream can't pin the
 * request handler indefinitely. Preserves any explicitly-passed signal.
 */
function timeoutFetch(input: Parameters<typeof fetch>[0], init: RequestInit = {}) {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) });
}

// Function to detect framework from project files
const detectFramework = (files: Record<string, string>): string => {
  // Check for package.json first
  const packageJson = files['package.json'];

  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson);
      const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };

      // Check for specific frameworks
      if (dependencies.next) {
        return 'nextjs';
      }

      if (dependencies.react && dependencies['@remix-run/react']) {
        return 'remix';
      }

      if (dependencies.react && dependencies.vite) {
        return 'vite';
      }

      if (dependencies.react && dependencies['@vitejs/plugin-react']) {
        return 'vite';
      }

      if (dependencies.react && dependencies['@nuxt/react']) {
        return 'nuxt';
      }

      if (dependencies.react && dependencies['@qwik-city/qwik']) {
        return 'qwik';
      }

      if (dependencies.react && dependencies['@sveltejs/kit']) {
        return 'sveltekit';
      }

      if (dependencies.react && dependencies.astro) {
        return 'astro';
      }

      if (dependencies.react && dependencies['@angular/core']) {
        return 'angular';
      }

      if (dependencies.react && dependencies.vue) {
        return 'vue';
      }

      if (dependencies.react && dependencies['@expo/react-native']) {
        return 'expo';
      }

      if (dependencies.react && dependencies['react-native']) {
        return 'react-native';
      }

      // Generic React app
      if (dependencies.react) {
        return 'react';
      }

      // Check for other frameworks
      if (dependencies['@angular/core']) {
        return 'angular';
      }

      if (dependencies.vue) {
        return 'vue';
      }

      if (dependencies['@sveltejs/kit']) {
        return 'sveltekit';
      }

      if (dependencies.astro) {
        return 'astro';
      }

      if (dependencies['@nuxt/core']) {
        return 'nuxt';
      }

      if (dependencies['@qwik-city/qwik']) {
        return 'qwik';
      }

      if (dependencies['@expo/react-native']) {
        return 'expo';
      }

      if (dependencies['react-native']) {
        return 'react-native';
      }

      // Check for build tools
      if (dependencies.vite) {
        return 'vite';
      }

      if (dependencies.webpack) {
        return 'webpack';
      }

      if (dependencies.parcel) {
        return 'parcel';
      }

      if (dependencies.rollup) {
        return 'rollup';
      }

      // Default to Node.js if package.json exists
      return 'nodejs';
    } catch (error) {
      console.error('Error parsing package.json:', error);
    }
  }

  // Check for other framework indicators
  if (files['next.config.js'] || files['next.config.ts']) {
    return 'nextjs';
  }

  if (files['remix.config.js'] || files['remix.config.ts']) {
    return 'remix';
  }

  if (files['vite.config.js'] || files['vite.config.ts']) {
    return 'vite';
  }

  if (files['nuxt.config.js'] || files['nuxt.config.ts']) {
    return 'nuxt';
  }

  if (files['svelte.config.js'] || files['svelte.config.ts']) {
    return 'sveltekit';
  }

  if (files['astro.config.js'] || files['astro.config.ts']) {
    return 'astro';
  }

  if (files['angular.json']) {
    return 'angular';
  }

  if (files['vue.config.js'] || files['vue.config.ts']) {
    return 'vue';
  }

  if (files['app.json'] && files['app.json'].includes('expo')) {
    return 'expo';
  }

  if (files['app.json'] && files['app.json'].includes('react-native')) {
    return 'react-native';
  }

  // Check for static site indicators
  if (files['index.html']) {
    return 'static';
  }

  // Default to unknown
  return 'other';
};

// Add loader function to handle GET requests
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  /*
   * Read the Vercel token from a request header, not the query string. A token
   * in the URL leaks into access logs, browser history and Referer headers. The
   * query param is kept only as a deprecated fallback for already-loaded clients.
   */
  const token = request.headers.get('x-vercel-token') ?? url.searchParams.get('token');

  if (!projectId || !token) {
    return json({ error: 'Missing projectId or token' }, { status: 400 });
  }

  /*
   * Validate the project id before interpolating it into the upstream URLs.
   * Without this, a value like `x?teamId=<victim>` injects an extra query
   * parameter into the deployments call and path characters (`/`, `..`) can
   * re-target the path of the v9 projects call. Matches the sibling Supabase
   * routes which validate + encode their refs.
   */
  if (!isValidVercelProjectId(projectId)) {
    return json({ error: 'Invalid projectId' }, { status: 400 });
  }

  try {
    // Get project info
    const projectResponse = await timeoutFetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!projectResponse.ok) {
      return json({ error: 'Failed to fetch project' }, { status: 400 });
    }

    const projectData = (await projectResponse.json()) as any;

    // Get latest deployment
    const deploymentsResponse = await timeoutFetch(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!deploymentsResponse.ok) {
      return json({ error: 'Failed to fetch deployments' }, { status: 400 });
    }

    const deploymentsData = (await deploymentsResponse.json()) as any;

    const latestDeployment = deploymentsData.deployments?.[0];

    return json({
      project: {
        id: projectData.id,
        name: projectData.name,
        url: `https://${projectData.name}.vercel.app`,
      },
      deploy: latestDeployment
        ? {
            id: latestDeployment.id,
            state: latestDeployment.state,
            url: latestDeployment.url ? `https://${latestDeployment.url}` : `https://${projectData.name}.vercel.app`,
          }
        : null,
    });
  } catch (error) {
    console.error('Error fetching Vercel deployment:', error);
    return json({ error: 'Failed to fetch deployment' }, { status: 500 });
  }
}

interface DeployRequestBody {
  projectId?: string;
  files: Record<string, string>;
  sourceFiles?: Record<string, string>;
  chatId: string;
  framework?: string;
}

// Existing action function for POST requests
export async function action({ request }: ActionFunctionArgs) {
  try {
    const {
      projectId,
      files,
      sourceFiles,
      token: fallbackToken,
      chatId,
      framework,
    } = (await request.json()) as DeployRequestBody & {
      token: string;
    };

    /*
     * Prefer the cross-device UserConnection token (server-decrypted for the
     * authenticated owner) over the bolt localStorage token from the browser, so a
     * Vercel connection made on another device works here. Falls back cleanly.
     */
    const token = await preferredConnectorToken(request, 'vercel', fallbackToken);

    if (!token) {
      return json({ error: 'Not connected to Vercel' }, { status: 401 });
    }

    /*
     * `projectId` is read straight from the untrusted request body. If a caller
     * supplies it for the existing-project branch, validate it before it is
     * interpolated into the upstream v9/projects URL below. Without this a value
     * like `prj?teamId=<victim>` injects an extra query parameter and path
     * characters (`/`, `..`) can re-target the request path. Mirrors the loader
     * guard at the top of this file.
     */
    if (projectId !== undefined && !isValidVercelProjectId(projectId)) {
      return json({ error: 'Invalid projectId' }, { status: 400 });
    }

    let targetProjectId = projectId;
    let projectInfo: VercelProjectInfo | undefined;

    // Detect framework from the source files if not provided
    let detectedFramework = framework;

    if (!detectedFramework && sourceFiles) {
      detectedFramework = detectFramework(sourceFiles);
      console.log('Detected framework from source files:', detectedFramework);
    }

    // If no projectId provided, create a new project
    if (!targetProjectId) {
      const projectName = buildVercelProjectName(chatId);

      const createProjectResponse = await timeoutFetch('https://api.vercel.com/v9/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          framework: detectedFramework || null,
        }),
      });

      if (!createProjectResponse.ok) {
        const errorData = (await createProjectResponse.json()) as any;
        return json(
          { error: `Failed to create project: ${errorData.error?.message || 'Unknown error'}` },
          { status: 400 },
        );
      }

      const newProject = (await createProjectResponse.json()) as any;
      targetProjectId = newProject.id;
      projectInfo = {
        id: newProject.id,
        name: newProject.name,
        url: `https://${newProject.name}.vercel.app`,
        chatId,
      };
    } else {
      // Get existing project info
      const projectResponse = await timeoutFetch(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(targetProjectId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (projectResponse.ok) {
        const existingProject = (await projectResponse.json()) as any;
        projectInfo = {
          id: existingProject.id,
          name: existingProject.name,
          url: `https://${existingProject.name}.vercel.app`,
          chatId,
        };
      } else {
        // If project doesn't exist, create a new one
        const projectName = buildVercelProjectName(chatId);

        const createProjectResponse = await timeoutFetch('https://api.vercel.com/v9/projects', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: projectName,
            framework: detectedFramework || null,
          }),
        });

        if (!createProjectResponse.ok) {
          const errorData = (await createProjectResponse.json()) as any;
          return json(
            { error: `Failed to create project: ${errorData.error?.message || 'Unknown error'}` },
            { status: 400 },
          );
        }

        const newProject = (await createProjectResponse.json()) as any;
        targetProjectId = newProject.id;
        projectInfo = {
          id: newProject.id,
          name: newProject.name,
          url: `https://${newProject.name}.vercel.app`,
          chatId,
        };
      }
    }

    // Prepare files for deployment
    const deploymentFiles = [];

    /*
     * For frameworks that need to build on Vercel, include source files
     * For static sites, only include build output
     */
    const shouldIncludeSourceFiles =
      detectedFramework &&
      ['nextjs', 'react', 'vite', 'remix', 'nuxt', 'sveltekit', 'astro', 'vue', 'angular'].includes(detectedFramework);

    if (shouldIncludeSourceFiles && sourceFiles) {
      // Include source files for frameworks that need to build
      for (const [filePath, content] of Object.entries(sourceFiles)) {
        // Ensure file path doesn't start with a slash for Vercel
        const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        deploymentFiles.push({
          file: normalizedPath,
          data: content,
        });
      }
    } else {
      // For static sites, only include build output
      for (const [filePath, content] of Object.entries(files)) {
        // Ensure file path doesn't start with a slash for Vercel
        const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        deploymentFiles.push({
          file: normalizedPath,
          data: content,
        });
      }
    }

    // Create deployment configuration based on framework
    const deploymentConfig: any = {
      name: projectInfo.name,
      project: targetProjectId,
      target: 'production',
      files: deploymentFiles,
    };

    // Add framework-specific configuration
    if (detectedFramework === 'nextjs') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = '.next';
    } else if (detectedFramework === 'react' || detectedFramework === 'vite') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'dist';
    } else if (detectedFramework === 'remix') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'public';
    } else if (detectedFramework === 'nuxt') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = '.output';
    } else if (detectedFramework === 'sveltekit') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'build';
    } else if (detectedFramework === 'astro') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'dist';
    } else if (detectedFramework === 'vue') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'dist';
    } else if (detectedFramework === 'angular') {
      deploymentConfig.buildCommand = 'npm run build';
      deploymentConfig.outputDirectory = 'dist';
    } else {
      // For static sites, no build command needed
      deploymentConfig.routes = [{ src: '/(.*)', dest: '/$1' }];
    }

    // Create a new deployment
    const deployResponse = await timeoutFetch(`https://api.vercel.com/v13/deployments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deploymentConfig),
    });

    if (!deployResponse.ok) {
      const errorData = (await deployResponse.json()) as any;
      return json(
        { error: `Failed to create deployment: ${errorData.error?.message || 'Unknown error'}` },
        { status: 400 },
      );
    }

    const deployData = (await deployResponse.json()) as any;

    // Poll for deployment status
    let retryCount = 0;

    const maxRetries = 60;

    let deploymentUrl = '';
    let deploymentState = '';

    /*
     * Track transient status-endpoint failures (rate limit / 5xx) separately so
     * we don't mistake "couldn't read the status" for "deploy didn't finish".
     */
    let consecutiveFailures = 0;

    while (retryCount < maxRetries) {
      let statusResponse: Response | undefined;

      try {
        statusResponse = await timeoutFetch(`https://api.vercel.com/v13/deployments/${deployData.id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(30000),
        });
      } catch (statusError) {
        // Network/timeout error talking to Vercel — treat as a transient failure.
        console.warn('Vercel status poll request failed:', statusError);
      }

      if (statusResponse?.ok) {
        consecutiveFailures = 0;

        const status = (await statusResponse.json()) as any;
        deploymentState = status.readyState;
        deploymentUrl = status.url ? `https://${status.url}` : '';

        if (status.readyState === 'READY' || status.readyState === 'ERROR') {
          break;
        }
      } else {
        consecutiveFailures++;
      }

      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const outcome = resolveVercelPollOutcome({
      retryCount,
      maxRetries,
      consecutiveFailures,
      deploymentState,
    });

    if (outcome.kind === 'error') {
      return json({ error: 'Deployment failed' }, { status: 500 });
    }

    if (outcome.kind === 'timed-out') {
      return json({ error: 'Deployment timed out' }, { status: 500 });
    }

    /*
     * 'pending' means the poll loop exhausted (or stopped early) without a
     * terminal state — typically because the status endpoint was unreachable.
     * The deployment may well have completed on Vercel's side, so surface the
     * deploy id (and a 202) instead of reporting a false failure, letting the
     * client keep polling.
     */
    if (outcome.kind === 'pending') {
      return json(
        {
          success: true,
          pending: true,
          deploy: {
            id: deployData.id,
            state: deploymentState || 'PENDING',
            url: projectInfo.url || deploymentUrl,
          },
          project: projectInfo,
        },
        { status: 202 },
      );
    }

    return json({
      success: true,
      deploy: {
        id: deployData.id,
        state: outcome.state,

        // Return public domain as deploy URL and private domain as fallback.
        url: projectInfo.url || deploymentUrl,
      },
      project: projectInfo,
    });
  } catch (error) {
    console.error('Vercel deploy error:', error);
    return json({ error: 'Deployment failed' }, { status: 500 });
  }
}
