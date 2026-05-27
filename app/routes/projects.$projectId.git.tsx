import { redirect, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw redirect('/projects');
  }

  const incoming = new URL(request.url);
  const target = new URL(`/projects/${encodeURIComponent(projectId)}/ide`, incoming.origin);

  for (const [key, value] of incoming.searchParams.entries()) {
    target.searchParams.set(key, value);
  }

  target.searchParams.set('view', 'git');

  throw redirect(`${target.pathname}${target.search}`);
}

export default function ProjectGitRedirect() {
  return null;
}
