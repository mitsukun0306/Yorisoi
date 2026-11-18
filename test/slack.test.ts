import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlackAdapter } from '../src/adapters/slack.ts';
import { fakeFetch } from './helpers.ts';

const routes = {
  'auth.test': { ok: true, user_id: 'UME', team_id: 'T1', url: 'https://team.slack.com/' },
  'search.messages': {
    ok: true,
    messages: {
      matches: [
        {
          ts: '1763434800.000100',
          text: '<@UME> 資料見てもらえますか？',
          user: 'UA',
          username: 'alice',
          permalink: 'https://team.slack.com/archives/C1/p1763434800000100?thread_ts=1763434700.000000',
          channel: { id: 'C1', name: 'general' },
        },
        { ts: '1.0', text: '<@UME> 自分', user: 'UME', channel: { id: 'C1' } },
      ],
    },
  },
  'conversations.list': { ok: true, channels: [{ id: 'D1', user: 'UB' }] },
  'conversations.history': {
    ok: true,
    messages: [
      { ts: '1763434900.000200', text: '今日ランチ行ける？', user: 'UB' },
      { ts: '1763434950.000300', text: 'いいよ', user: 'UME' },
    ],
  },
  'users.info': { ok: true, user: { name: 'bob', profile: { display_name: 'ボブ' } } },
  'chat.postMessage': { ok: true },
};

const config = { userToken: 'xoxp-test', dmLimit: 20, apiBase: 'https://slack.test/api' };

test('Slack: 自分へのメンションとDMを集め、自分の発言は除く', async () => {
  const { fetch, calls } = fakeFetch(routes);
  const mentions = await new SlackAdapter(config, fetch).fetchMentions();
  assert.deepEqual(
    mentions.map((m) => [m.id, m.author, m.text]),
    [
      ['slack:C1:1763434800.000100', 'alice', '#general: <@UME> 資料見てもらえますか？'],
      ['slack:D1:1763434900.000200', 'ボブ', '(DM) 今日ランチ行ける？'],
    ],
  );
  assert.equal(mentions[1].url, 'https://team.slack.com/archives/D1/p1763434900000200');
  assert.equal(calls[0].headers.Authorization, 'Bearer xoxp-test');
});

test('Slack: チャンネルのメンションには元のスレッドに返信する', async () => {
  const { fetch, calls } = fakeFetch(routes);
  const a = new SlackAdapter(config, fetch);
  const [m] = await a.fetchMentions();
  await a.reply(m, '確認します！');
  const body = JSON.parse(calls.find((c) => c.url.includes('chat.postMessage'))!.body!);
  assert.deepEqual(body, { channel: 'C1', text: '確認します！', thread_ts: '1763434700.000000' });
});

test('Slack: DMにはスレッドにせずそのまま返す', async () => {
  const { fetch, calls } = fakeFetch(routes);
  const a = new SlackAdapter(config, fetch);
  const dm = (await a.fetchMentions())[1];
  await a.reply(dm, '行く！');
  const body = JSON.parse(calls.find((c) => c.url.includes('chat.postMessage'))!.body!);
  assert.deepEqual(body, { channel: 'D1', text: '行く！' });
});

test('Slack: ok:false はエラーにする', async () => {
  const { fetch } = fakeFetch({ 'auth.test': { ok: false, error: 'invalid_auth' } });
  await assert.rejects(new SlackAdapter(config, fetch).fetchMentions(), /invalid_auth/);
});
