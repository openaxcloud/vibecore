import { data as json, type LoaderFunctionArgs } from 'react-router';

export const loader = async ({ request: _request }: LoaderFunctionArgs) => {
  return json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
};
