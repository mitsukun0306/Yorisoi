import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlackNotifier } from '../src/notifiers/slack.ts';
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

test('Slack通知: アプリから自分にDMを1通にまとめて送る', async () => {
  const { fetch, calls } = fakeFetch({ 'chat.postMessage': { ok: true } });
  await new SlackNotifier({ botToken: 'xoxb-t', userId: 'UME', apiBase: 'https://slack.test/api' }, fetch).notify([m, m]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.Authorization, 'Bearer xoxb-t');
  const body = JSON.parse(calls[0].body!);
  assert.equal(body.channel, 'UME');
  assert.match(body.text, /2 件/);
  assert.match(body.text, /山田 太郎/);
});

test('Slack通知: ok:false は失敗にする', async () => {
  const { fetch } = fakeFetch({ 'chat.postMessage': { ok: false, error: 'not_authed' } });
  await assert.rejects(
    new SlackNotifier({ botToken: 'x', userId: 'U', apiBase: 'https://slack.test/api' }, fetch).notify([m]),
    /not_authed/,
  );
});

test('通知: 0件のときは何も送らない', async () => {
  const { fetch, calls } = fakeFetch({});
  await new SlackNotifier({ botToken: 't', userId: 'U' }, fetch).notify([]);
  await new WebhookNotifier({ url: 'https://hook.test', format: 'discord' }, fetch).notify([]);
  assert.equal(calls.length, 0);
});

test('Webhook: Discord形式で送る', async () => {
  const { fetch, calls } = fakeFetch({ 'hook.test': {} });
  await new WebhookNotifier({ url: 'https://hook.test', format: 'discord' }, fetch).notify([m]);
  assert.match(JSON.parse(calls[0].body!).content, /taro@example.com/);
});
