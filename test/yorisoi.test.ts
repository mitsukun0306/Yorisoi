import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockAdapter } from '../src/adapters/mock.ts';
import { MentionStore } from '../src/core/store.ts';
import { Yorisoi } from '../src/core/yorisoi.ts';
import { DEFAULT_AUTO_REPLY, validateRules, type AutoReplyConfig } from '../src/core/rules.ts';
import type { Mention, Notifier, SnsAdapter } from '../src/core/types.ts';
import { tempFile } from './helpers.ts';

const mention = (id: string, author: string, text: string, createdAt = '2026-11-18T00:00:00Z'): Mention => ({
  id: `mock:${id}`,
  platform: 'mock',
  author,
  text,
  createdAt,
  replyRef: {},
});

class RecordingNotifier implements Notifier {
  readonly name = 'rec';
  batches: Mention[][] = [];
  fail = false;
  async notify(m: Mention[]) {
    if (this.fail) throw new Error('down');
    this.batches.push(m);
  }
}

async function setup(autoReply: AutoReplyConfig = DEFAULT_AUTO_REPLY, adapters?: SnsAdapter[]) {
  const store = new MentionStore(await tempFile());
  const adapter = new MockAdapter([]);
  const notifier = new RecordingNotifier();
  const logs: string[] = [];
  const app = new Yorisoi({
    adapters: adapters ?? [adapter],
    notifiers: [notifier],
    store,
    autoReply,
    log: (l) => logs.push(l),
  });
  return { store, adapter, notifier, app, logs };
}

test('新しいメンションだけを通知し、2回目は同じものを通知しない', async () => {
  const { app, adapter, notifier, store } = await setup();
  const mentions = (adapter as unknown as { mentions: Mention[] }).mentions;
  mentions.push(mention('1', 'a', 'hi'));
  await app.sync();
  mentions.push(mention('2', 'b', 'yo', '2026-11-18T01:00:00Z'));
  const r = await app.sync();
  assert.deepEqual(r.added.map((m) => m.id), ['mock:2']);
  assert.equal(notifier.batches.length, 2);
  assert.equal(store.get('mock:1')?.status, 'notified');
});

test('保存したものは読み直しても残る', async () => {
  const path = await tempFile();
  const s1 = new MentionStore(path);
  s1.addNew([mention('1', 'a', 'hi')]);
  await s1.save();
  const s2 = new MentionStore(path);
  await s2.load();
  assert.equal(s2.get('mock:1')?.text, 'hi');
});

test('通知に失敗したら「未通知」のまま残す', async () => {
  const { app, adapter, notifier, store } = await setup();
  (adapter as unknown as { mentions: Mention[] }).mentions.push(mention('1', 'a', 'hi'));
  notifier.fail = true;
  const r = await app.sync();
  assert.equal(store.get('mock:1')?.status, 'new');
  assert.equal(r.errors[0].platform, 'notifier:rec');
});

test('1つのSNSが失敗しても他のSNSは集める', async () => {
  const broken: SnsAdapter = {
    platform: 'slack',
    fetchMentions: async () => {
      throw new Error('boom');
    },
    reply: async () => {},
  };
  const ok = new MockAdapter([mention('1', 'a', 'hi')]);
  const { app } = await setup(DEFAULT_AUTO_REPLY, [broken, ok]);
  const r = await app.sync();
  assert.equal(r.added.length, 1);
  assert.deepEqual(r.errors, [{ platform: 'slack', error: 'boom' }]);
});

test('指示した返信を送り、返信済みにする', async () => {
  const { app, adapter, store } = await setup();
  (adapter as unknown as { mentions: Mention[] }).mentions.push(mention('abc', 'a', 'hi'));
  await app.sync();
  await app.sendReply('mock:ab', 'どうも'); // 前方一致
  assert.equal(adapter.sent[0].text, 'どうも');
  assert.equal(store.get('mock:abc')?.status, 'replied');
  assert.equal(store.get('mock:abc')?.reply?.by, 'manual');
});

test('自動返信: 初期設定では何も送らない', async () => {
  const { app, adapter } = await setup();
  const mentions = (adapter as unknown as { mentions: Mention[] }).mentions;
  mentions.push(mention('0', 'x', 'seed'));
  await app.sync();
  mentions.push(mention('1', 'a', 'ありがとう'));
  await app.sync();
  assert.equal(adapter.sent.length, 0);
});

const rules: AutoReplyConfig['rules'] = [{ name: 'お礼', contains: ['ありがとう'], reply: 'こちらこそ！' }];

test('自動返信: お試しモードでは送らずに予定だけ記録する', async () => {
  const { app, adapter, logs } = await setup({ enabled: true, dryRun: true, rules });
  const mentions = (adapter as unknown as { mentions: Mention[] }).mentions;
  mentions.push(mention('0', 'x', 'seed'));
  await app.sync();
  mentions.push(mention('1', 'a', 'ありがとう'));
  const r = await app.sync();
  assert.equal(adapter.sent.length, 0);
  assert.equal(r.autoReplies[0].sent, false);
  assert.match(logs[0], /お試しモード/);
});

test('自動返信: 有効にするとルールに一致したものだけに返信する', async () => {
  const { app, adapter, store } = await setup({ enabled: true, dryRun: false, rules });
  const mentions = (adapter as unknown as { mentions: Mention[] }).mentions;
  mentions.push(mention('0', 'x', 'ありがとう（初回取り込み分）'));
  await app.sync();
  assert.equal(adapter.sent.length, 0, '初回に取り込んだ過去分には返信しない');
  mentions.push(mention('1', 'a', 'ありがとう'), mention('2', 'b', 'こんにちは'));
  await app.sync();
  assert.deepEqual(adapter.sent.map((s) => [s.mention.id, s.text]), [['mock:1', 'こちらこそ！']]);
  assert.equal(store.get('mock:1')?.reply?.by, 'rule');
  assert.equal(store.get('mock:2')?.status, 'notified');
});

test('条件の無いルール（全員に返信）は受け付けない', () => {
  assert.throws(() => validateRules([{ name: 'all', reply: 'hi' }]), /from か contains/);
});
