import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GmailAdapter, buildReplyMime, parseAddress } from '../src/adapters/gmail.ts';
import { fakeFetch } from './helpers.ts';

const routes = {
  'oauth.test/token': { access_token: 'at', expires_in: 3600 },
  '/messages?': { messages: [{ id: 'g1' }] },
  '/messages/g1?': {
    id: 'g1',
    threadId: 't1',
    snippet: '来週の打ち合わせについて',
    internalDate: '1763434800000',
    payload: {
      headers: [
        { name: 'From', value: '"山田 太郎" <taro@example.com>' },
        { name: 'Subject', value: '打ち合わせ' },
        { name: 'Message-ID', value: '<abc@example.com>' },
      ],
    },
  },
  '/messages/send': { id: 'sent' },
};

const config = {
  clientId: 'id',
  clientSecret: 'secret',
  refreshToken: 'rt',
  query: 'is:unread',
  maxResults: 20,
  apiBase: 'https://gmail.test/me',
  tokenUrl: 'https://oauth.test/token',
};

test('parseAddress: 名前付き・名前なしのアドレスを分ける', () => {
  assert.deepEqual(parseAddress('"山田 太郎" <taro@example.com>'), { name: '山田 太郎', email: 'taro@example.com' });
  assert.deepEqual(parseAddress('a@example.com'), { email: 'a@example.com' });
});

test('Gmail: 未読メールを集め、トークンは使い回す', async () => {
  const { fetch, calls } = fakeFetch(routes);
  const [m] = await new GmailAdapter(config, fetch).fetchMentions();
  assert.equal(m.author, 'taro@example.com');
  assert.equal(m.authorName, '山田 太郎');
  assert.equal(m.text, '【打ち合わせ】来週の打ち合わせについて');
  assert.equal(m.createdAt, new Date(1763434800000).toISOString());
  assert.equal(calls.filter((c) => c.url.includes('token')).length, 1);
  assert.equal(calls[2].headers.Authorization, 'Bearer at');
});

test('Gmail: 同じスレッドに Re: 件名と In-Reply-To 付きで返信する', async () => {
  const { fetch, calls } = fakeFetch(routes);
  const a = new GmailAdapter(config, fetch);
  const [m] = await a.fetchMentions();
  await a.reply(m, '承知しました。');
  const body = JSON.parse(calls.find((c) => c.url.endsWith('/messages/send'))!.body!);
  assert.equal(body.threadId, 't1');
  const mime = Buffer.from(body.raw, 'base64url').toString();
  assert.match(mime, /^To: "山田 太郎" <taro@example.com>\r\n/);
  assert.match(mime, /In-Reply-To: <abc@example.com>/);
  const subject = mime.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)![1];
  assert.equal(Buffer.from(subject, 'base64').toString(), 'Re: 打ち合わせ');
  const text = mime.split('\r\n\r\n')[1];
  assert.equal(Buffer.from(text, 'base64').toString(), '承知しました。');
});

test('buildReplyMime: すでに Re: の件名には重ねない', () => {
  const mime = buildReplyMime({ to: 'a@x', subject: 'RE: hi', messageId: '', text: 'ok' });
  assert.match(mime, /Subject: RE: hi\r\n/);
  assert.doesNotMatch(mime, /In-Reply-To/);
});
