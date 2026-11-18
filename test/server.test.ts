import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { MockAdapter } from '../src/adapters/mock.ts';
import { MentionStore } from '../src/core/store.ts';
import { Yorisoi } from '../src/core/yorisoi.ts';
import { DEFAULT_AUTO_REPLY } from '../src/core/rules.ts';
import type { Mention } from '../src/core/types.ts';
import { InAppNotifier } from '../src/notifiers/in-app.ts';
import { createAppServer } from '../src/server.ts';
import { tempFile } from './helpers.ts';

const mention = (id: string, text: string): Mention => ({
  id: `slack:C1:${id}`,
  platform: 'slack',
  author: 'aoki',
  text,
  createdAt: '2026-11-18T00:00:00Z',
  replyRef: {},
});

async function start(accessToken?: string) {
  const store = new MentionStore(await tempFile());
  const adapter = new MockAdapter([mention('1.0', 'レビューお願いします')], 'slack');
  const inApp = new InAppNotifier();
  const app = new Yorisoi({ adapters: [adapter], notifiers: [inApp], store, autoReply: DEFAULT_AUTO_REPLY, log: () => {} });
  const server = createAppServer({
    app,
    store,
    inApp,
    accessToken,
    platforms: ['slack'],
    publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const close = () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); });
  return { base, adapter, store, inApp, close };
}

const post = (url: string, body: unknown = {}, headers: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('アプリ: 同期 → 一覧 → 返信 の流れ', async (t) => {
  const s = await start();
  t.after(s.close);
  const sync = await (await post(`${s.base}/api/sync`)).json();
  assert.equal(sync.added, 1);

  const list = await (await fetch(`${s.base}/api/mentions`)).json();
  assert.equal(list.mentions.length, 1);
  const id = encodeURIComponent(list.mentions[0].id);

  const res = await post(`${s.base}/api/mentions/${id}/reply`, { text: '  見ます！ ' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).mention.status, 'replied');
  assert.equal(s.adapter.sent[0].text, '見ます！');

  const after = await (await fetch(`${s.base}/api/mentions`)).json();
  assert.equal(after.mentions.length, 0, '返信済みは未返信の一覧から消える');
  const all = await (await fetch(`${s.base}/api/mentions?status=all`)).json();
  assert.equal(all.mentions.length, 1);
});

test('アプリ: 対応不要と、未返信に戻す', async (t) => {
  const s = await start();
  t.after(s.close);
  await post(`${s.base}/api/sync`);
  const id = encodeURIComponent('slack:C1:1.0');
  assert.equal((await (await post(`${s.base}/api/mentions/${id}/ignore`)).json()).mention.status, 'ignored');
  assert.equal((await (await post(`${s.base}/api/mentions/${id}/reopen`)).json()).mention.status, 'notified');
});

test('アプリ: 空の返信や存在しないIDはエラー', async (t) => {
  const s = await start();
  t.after(s.close);
  await post(`${s.base}/api/sync`);
  assert.equal((await post(`${s.base}/api/mentions/${encodeURIComponent('slack:C1:1.0')}/reply`, { text: ' ' })).status, 400);
  assert.equal((await post(`${s.base}/api/mentions/nope/reply`, { text: 'x' })).status, 404);
  assert.equal(s.adapter.sent.length, 0);
});

test('アプリ: 合言葉を設定するとAPIに必要になる（画面のファイルは開ける）', async (t) => {
  const s = await start('secret');
  t.after(s.close);
  assert.equal((await fetch(`${s.base}/api/mentions`)).status, 401);
  assert.equal((await fetch(`${s.base}/api/mentions`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await fetch(`${s.base}/api/mentions`, { headers: { Authorization: 'Bearer secret' } })).status, 200);
  assert.equal((await fetch(`${s.base}/`)).status, 200);
});

test('アプリ: 画面のフォルダの外のファイルは返さない', async (t) => {
  const s = await start();
  t.after(s.close);
  assert.equal((await fetch(`${s.base}/..%2Fpackage.json`)).status, 404);
  assert.equal((await fetch(`${s.base}/%2e%2e/package.json`)).status, 404);
});

test('アプリ: 新着はイベントで画面に届く', async (t) => {
  const s = await start();
  t.after(s.close);
  const ctrl = new AbortController();
  t.after(() => ctrl.abort());
  const res = await fetch(`${s.base}/api/events`, { signal: ctrl.signal });
  const reader = res.body!.getReader();
  await reader.read(); // connected
  await post(`${s.base}/api/sync`);
  let text = '';
  while (!text.includes('event: mentions')) text += new TextDecoder().decode((await reader.read()).value);
  assert.match(text, /レビューお願いします/);
});
