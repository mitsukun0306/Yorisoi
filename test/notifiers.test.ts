import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LineNotifier } from '../src/notifiers/line.ts';
import { WebhookNotifier } from '../src/notifiers/webhook.ts';
import type { Mention } from '../src/core/types.ts';
import { fakeFetch } from './helpers.ts';

const m: Mention = {
  id: 'gmail:1',
  platform: 'gmail',
  author: 'taro@example.com',
  authorName: '山田 太郎',
  text: '【打ち合わせ】来週どうですか',
  createdAt: '2026-11-18T00:00:00Z',
  replyRef: {},
};

test('LINE: 自分宛てに1通にまとめてプッシュする', async () => {
  const { fetch, calls } = fakeFetch({ '/v2/bot/message/push': {} });
  await new LineNotifier({ channelAccessToken: 'tok', toUserId: 'U123', apiBase: 'https://line.test' }, fetch).notify([m, m]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  const body = JSON.parse(calls[0].body!);
  assert.equal(body.to, 'U123');
  assert.match(body.messages[0].text, /2 件/);
  assert.match(body.messages[0].text, /山田 太郎/);
});

test('通知: 0件のときは何も送らない', async () => {
  const { fetch, calls } = fakeFetch({});
  await new LineNotifier({ channelAccessToken: 't', toUserId: 'U' }, fetch).notify([]);
  await new WebhookNotifier({ url: 'https://hook.test', format: 'discord' }, fetch).notify([]);
  assert.equal(calls.length, 0);
});

test('Webhook: Discord形式で送る', async () => {
  const { fetch, calls } = fakeFetch({ 'hook.test': {} });
  await new WebhookNotifier({ url: 'https://hook.test', format: 'discord' }, fetch).notify([m]);
  assert.match(JSON.parse(calls[0].body!).content, /taro@example.com/);
});
