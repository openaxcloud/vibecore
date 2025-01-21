import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';

interface PackageJson {
  name: string;
  version: string;
  description: string;
  license: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

const packageJson = {
  name: 'bolt.diy',
  version: '0.1.0',
  description: 'A DIY LLM interface',
  license: 'MIT',
  dependencies: {
    '@remix-run/cloudflare': '^2.0.0',
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    typescript: '^5.0.0',
  },
  devDependencies: {
    '@types/react': '^18.0.0',
    '@types/react-dom': '^18.0.0',
  },
} as PackageJson;

export const action = async ({ request: _request }: ActionFunctionArgs) => {
  try {
    return json({
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      license: packageJson.license,
      nodeVersion: process.version,
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
    });
  } catch (error) {
    console.error('Failed to get webapp info:', error);
    return json({ error: 'Failed to get webapp information' }, { status: 500 });
  }
};
