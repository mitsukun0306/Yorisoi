import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstagramAdapter } from '../src/adapters/instagram.ts';
import { fakeFetch } from './helpers.ts';

const routes = {
  '/v23.0/me?': { user_id: '111', username: 'me_official' },
  '/v23.0/me/media?': {
    data: [
      {
        id: 'm1',
        permalink: 'https://www.instagram.com/p/AAA/',
        comments: {
          data: [
            {
              id: 'c1',
              text: '素敵な写真！',
              username: 'alice',
              timestamp: '2026-11-18T01:00:00+0000',
              replies: {
                data: [
                  { id: 'c2', text: 'ありがとう', username: 'me_official', timestamp: '2026-11-18T02:00:00+0000' },
                  { id: 'c3', text: 'どこで撮ったの？', username: 'bob', timestamp: '2026-11-18T03:00:00+0000' },
                ],
              },
            },
          ],
        },
      },
    ],
  },
  '/v23.0/me/conversations?': {
    data: [
      {
        id: 'conv1',
        messages: {
          data: [
            { id: 'dm2', message: '了解です', created_time: '2026-11-18T05:00:00+0000', from: { id: '111', username: 'me_official' } },
            { id: 'dm1', message: '明日空いてる？', created_time: '2026-11-18T04:00:00+0000', from: { id: '999', username: 'carol' } },
          ],
        },
      },
    ],
  },
  '/replies?': { id: 'new-comment' },
  '/v23.0/me/messages?': { message_id: 'new-dm' },
};

const config = { accessToken: 'tok', apiVersion: 'v23.0', recentMediaCount: 10, includeDms: true, baseUrl: 'https://ig.test' };

test('Instagram: 他人のコメントとDMを集め、自分の投稿は除く', async () => {
  const { fetch } = fakeFetch(routes);
  const mentions = await new InstagramAdapter(config, fetch).fetchMentions();
  assert.deepEqual(
    mentions.map((m) => [m.id, m.author, m.text]),
    [
      ['instagram:comment:c1', 'alice', '素敵な写真！'],
      ['instagram:comment:c3', 'bob', 'どこで撮ったの？'],
      ['instagram:dm:dm1', 'carol', '明日空いてる？'],
    ],
  );
  assert.equal(mentions[0].createdAt, '2026-11-18T01:00:00.000Z');
  assert.equal(mentions[0].url, 'https://www.instagram.com/p/AAA/');
});

test('Instagram: DMは設定しなければ取りに行かない', async () => {
  const { fetch, calls } = fakeFetch(routes);
  await new InstagramAdapter({ ...config, includeDms: false }, fetch).fetchMentions();
  assert.ok(!calls.some((c) => c.url.includes('conversations')));
});

test('Instagram: コメントへの返信は一番上のコメントに @相手 付きで送る', async () => {
  const { fetch, calls } = fakeFetch(routes);
  const a = new InstagramAdapter(config, fetch);
  const bob = (await a.fetchMentions()).find((m) => m.author === 'bob')!;
  await a.reply(bob, '近所の公園です');
  const post = calls.find((c) => c.url.includes('/replies?'))!;
  const url = new URL(post.url);
  assert.equal(post.method, 'POST');
  assert.equal(url.pathname, '/v23.0/c1/replies');
  assert.equal(url.searchParams.get('message'), '@bob 近所の公園です');
});

test('Instagram: DMへの返信は相手のIDに送る', async () => {
  const { fetch, calls } = fakeFetch(routes);
  const a = new InstagramAdapter(config, fetch);
  const dm = (await a.fetchMentions()).find((m) => m.author === 'carol')!;
  await a.reply(dm, '空いてるよ');
  const post = calls.find((c) => c.url.includes('/me/messages?'))!;
  assert.deepEqual(JSON.parse(post.body!), { recipient: { id: '999' }, message: { text: '空いてるよ' } });
});
