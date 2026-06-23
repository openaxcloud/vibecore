import type { ActionFunctionArgs, LoaderFunction } from 'react-router';
import { data as json } from 'react-router';
import { getDiskInfo } from '~/lib/.server/disk-info';

const errorResponse = (error: unknown) =>
  json(
    [
      {
        filesystem: 'Unknown',
        size: 0,
        used: 0,
        available: 0,
        percentage: 0,
        mountpoint: '/',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    ],
    { status: 500 },
  );

export const loader: LoaderFunction = async ({ request: _request }) => {
  try {
    return json(await getDiskInfo());
  } catch (error) {
    console.error('Failed to get disk info:', error);
    return errorResponse(error);
  }
};

export const action = async ({ request: _request }: ActionFunctionArgs) => {
  try {
    return json(await getDiskInfo());
  } catch (error) {
    console.error('Failed to get disk info:', error);
    return errorResponse(error);
  }
};
