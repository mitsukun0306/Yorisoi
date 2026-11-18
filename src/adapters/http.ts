/** テストで差し替えられるようにfetchを注入できる形にしておく。 */
export type FetchFn = typeof fetch;

export async function requestJson<T>(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetchFn(url, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}: ${body.slice(0, 300)}`);
  }
  return (body ? JSON.parse(body) : {}) as T;
}
