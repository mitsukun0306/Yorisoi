import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FetchFn } from '../src/adapters/http.ts';

export async function tempFile(name = 'mentions.json'): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'yorisoi-')), name);
}

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** URLの一部に一致した応答を返す偽fetch。呼ばれた内容を calls に記録する。 */
export function fakeFetch(routes: Record<string, unknown>): { fetch: FetchFn; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as FetchFn;
  return { fetch: fn, calls };
}
