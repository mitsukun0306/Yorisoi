import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import type { MentionStore } from './core/store.ts';
import type { Yorisoi } from './core/yorisoi.ts';
import type { InAppNotifier } from './notifiers/in-app.ts';

export interface ServerDeps {
  app: Yorisoi;
  store: MentionStore;
  inApp: InAppNotifier;
  /** 設定されていれば、すべてのAPIでこの合言葉を求める */
  accessToken?: string;
  /** 有効になっているサービスの名前（画面の表示用） */
  platforms: string[];
  publicDir: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, '大きすぎます');
  }
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'JSONが不正です');
  }
}

function authorized(req: IncomingMessage, url: URL, token?: string): boolean {
  if (!token) return true;
  const given = req.headers.authorization?.replace(/^Bearer /, '') ?? url.searchParams.get('token') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Yorisoiアプリ（画面とAPI）のHTTPサーバーを作る。 */
export function createAppServer(deps: ServerDeps): Server {
  const { app, store, inApp } = deps;
  let syncing: Promise<unknown> | undefined;

  const routes = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (path === '/api/status' && method === 'GET') {
      return send(res, 200, { platforms: deps.platforms });
    }

    if (path === '/api/mentions' && method === 'GET') {
      const all = url.searchParams.get('status') === 'all';
      return send(res, 200, { mentions: store.list(all ? undefined : { status: ['new', 'notified'] }) });
    }

    if (path === '/api/sync' && method === 'POST') {
      // 同時に何度押されても同期は1回だけ走らせる
      syncing ??= app.sync().finally(() => (syncing = undefined));
      const r = (await syncing) as Awaited<ReturnType<Yorisoi['sync']>>;
      return send(res, 200, { added: r.added.length, errors: r.errors, autoReplies: r.autoReplies });
    }

    const action = path.match(/^\/api\/mentions\/([^/]+)\/(reply|ignore|reopen)$/);
    if (action && method === 'POST') {
      const id = decodeURIComponent(action[1]);
      const m = store.get(id);
      if (!m) throw new HttpError(404, 'メッセージが見つかりません');
      if (action[2] === 'reply') {
        const { text } = await readJson(req);
        if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, '返信文を入力してください');
        try {
          await app.sendReply(id, text.trim());
        } catch (err) {
          throw new HttpError(502, `返信できませんでした: ${(err as Error).message}`);
        }
      } else {
        store.setStatus(id, action[2] === 'ignore' ? 'ignored' : 'notified');
      }
      await store.save();
      return send(res, 200, { mention: store.get(id) });
    }

    if (path === '/api/events' && method === 'GET') {
      // 新着をリアルタイムで画面に届ける（Server-Sent Events）
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      const off = inApp.subscribe((mentions) => res.write(`event: mentions\ndata: ${JSON.stringify(mentions)}\n\n`));
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        off();
        clearInterval(ping);
      });
      return;
    }

    throw new HttpError(404, '見つかりません');
  };

  const serveStatic = async (res: ServerResponse, url: URL): Promise<void> => {
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = normalize(join(deps.publicDir, rel));
    if (!file.startsWith(normalize(deps.publicDir))) throw new HttpError(404, '見つかりません');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      throw new HttpError(404, '見つかりません');
    }
  };

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (!url.pathname.startsWith('/api/')) return await serveStatic(res, url);
      if (!authorized(req, url, deps.accessToken)) {
        return send(res, 401, { error: '合言葉が違います', needsToken: true });
      }
      await routes(req, res, url);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (!res.headersSent) send(res, status, { error: (err as Error).message });
      else res.end();
    }
  });
}
