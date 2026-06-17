import type { LoaderFunctionArgs } from 'react-router';

import { json } from '~/lib/enterprise-api.server';
import {
  listEcodeTemplates,
  paginateTemplates,
  type ListTemplatesOptions,
} from '~/lib/marketing/ecode-template-catalog.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const options = templateOptionsFromSearchParams(url.searchParams);
  const templates = listEcodeTemplates(options);

  if (expectsPaginatedMarketplaceResponse(url.searchParams)) {
    return json(paginateTemplates(templates, options.page, options.pageSize));
  }

  return json(templates);
}

function templateOptionsFromSearchParams(params: URLSearchParams): ListTemplatesOptions {
  return {
    category: params.get('category'),
    community: booleanParam(params.get('community')),
    difficulty: params.getAll('difficulty'),
    featured: booleanParam(params.get('featured')),
    languages: params.getAll('languages'),
    maxPrice: numberParam(params.get('maxPrice')),
    official: booleanParam(params.get('official')),
    page: numberParam(params.get('page')) ?? undefined,
    pageSize: numberParam(params.get('pageSize')) ?? undefined,
    query: params.get('query') ?? params.get('q'),
    sortBy: params.get('sortBy'),
    tags: params.getAll('tags'),
  };
}

function expectsPaginatedMarketplaceResponse(params: URLSearchParams) {
  return ['page', 'pageSize', 'sortBy', 'maxPrice', 'featured', 'official', 'community'].some((key) => params.has(key));
}

function booleanParam(value: string | null) {
  if (value === null) {
    return null;
  }

  return value === 'true';
}

function numberParam(value: string | null) {
  if (value === null || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}
