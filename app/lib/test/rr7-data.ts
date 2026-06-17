/**
 * Test helper: normalize a React Router 7 loader/action result into a real
 * `Response`.
 *
 * Under Remix v2 single-fetch, loaders/actions returned a real `Response` from
 * `json()`, so specs could assert `result.status` / `await result.json()`.
 * React Router 7's `data()` (the codemod's `data as json`) instead returns a
 * `DataWithResponseInit` sentinel — `{ type, data, init }` — that the framework
 * serializes at the boundary. It is NOT a `Response`, so those same assertions
 * fail with "response.json is not a function" / "expected undefined to be 200".
 *
 * `toResponse()` reconstructs the `Response` the framework would have produced,
 * letting the existing `.status` / `.json()` assertions keep working unchanged.
 * Real `Response` results (thrown redirects, the json-response shim routes, raw
 * `new Response(...)`) are passed through untouched.
 */
export function toResponse<T>(result: T): T extends Response ? Response : Response | T {
  if (result instanceof Response) {
    return result as never;
  }

  if (isDataWithResponseInit(result)) {
    const init = result.init ?? undefined;

    return Response.json(result.data, init ?? undefined) as never;
  }

  /*
   * Pass through any other loader/action return value untouched — RR7 allows
   * a loader to return a bare object (serialized for `useLoaderData`) or `null`
   * (e.g. signup's loader returns null so the form renders). Those callers
   * assert on the raw value (`.toBeNull()`, property access), not on a
   * `Response`, so leaving them as-is keeps those assertions working.
   */
  return result as never;
}

interface DataWithResponseInitLike {
  type: 'DataWithResponseInit';
  data: unknown;
  init: ResponseInit | null;
}

export function isDataWithResponseInit(value: unknown): value is DataWithResponseInitLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'DataWithResponseInit' &&
    'data' in value &&
    'init' in value
  );
}
