import type { MentionStore } from './store.ts';
import type { Notifier, SnsAdapter, StoredMention } from './types.ts';
import { matchRule, type AutoReplyConfig } from './rules.ts';

export interface SyncResult {
  added: StoredMention[];
  errors: { platform: string; error: string }[];
  autoReplies: { mentionId: string; rule: string; text: string; sent: boolean }[];
}

export interface YorisoiDeps {
  adapters: SnsAdapter[];
  notifiers: Notifier[];
  store: MentionStore;
  autoReply: AutoReplyConfig;
  log?: (line: string) => void;
}

/** 集約 → 保存 → 通知 → （ルールがあれば）自動返信 をまとめて行う本体。 */
export class Yorisoi {
  private readonly deps: YorisoiDeps;
  private readonly log: (line: string) => void;

  constructor(deps: YorisoiDeps) {
    this.deps = deps;
    this.log = deps.log ?? ((l) => console.error(l));
  }

  private adapterFor(platform: string): SnsAdapter {
    const a = this.deps.adapters.find((x) => x.platform === platform);
    if (!a) throw new Error(`${platform} は設定されていません（.env を確認してください）`);
    return a;
  }

  async sync(): Promise<SyncResult> {
    const { store, adapters, notifiers } = this.deps;
    const result: SyncResult = { added: [], errors: [], autoReplies: [] };
    const firstSync = new Set<string>();

    for (const adapter of adapters) {
      // 初回は過去の分をまとめて取り込むだけにし、自動返信の対象にしない
      if (store.list().every((m) => m.platform !== adapter.platform)) firstSync.add(adapter.platform);
      try {
        result.added.push(...store.addNew(await adapter.fetchMentions()));
      } catch (err) {
        // 1つのSNSが落ちても他のSNSは続ける
        result.errors.push({ platform: adapter.platform, error: (err as Error).message });
      }
    }
    result.added.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (result.added.length > 0) {
      let delivered = false;
      for (const n of notifiers) {
        try {
          await n.notify(result.added);
          delivered = true;
        } catch (err) {
          result.errors.push({ platform: `notifier:${n.name}`, error: (err as Error).message });
        }
      }
      // どこにも届かなかったら「未通知」のまま残し、次回もう一度通知する
      if (delivered) for (const m of result.added) store.setStatus(m.id, 'notified');
    }

    await this.applyRules(result, firstSync);
    await store.save();
    return result;
  }

  private async applyRules(result: SyncResult, firstSync: Set<string>): Promise<void> {
    const cfg = this.deps.autoReply;
    if (!cfg.enabled || cfg.rules.length === 0) return;
    for (const m of result.added) {
      if (firstSync.has(m.platform)) continue;
      const rule = matchRule(m, cfg.rules);
      if (!rule) continue;
      if (cfg.dryRun) {
        this.log(`（お試しモード）ルール「${rule.name}」で ${m.id} に「${rule.reply}」と返信する予定でした`);
        result.autoReplies.push({ mentionId: m.id, rule: rule.name, text: rule.reply, sent: false });
        continue;
      }
      try {
        await this.sendReply(m.id, rule.reply, 'rule');
        result.autoReplies.push({ mentionId: m.id, rule: rule.name, text: rule.reply, sent: true });
      } catch (err) {
        result.errors.push({ platform: m.platform, error: `自動返信に失敗 (${m.id}): ${(err as Error).message}` });
      }
    }
  }

  /** ユーザーの指示で返信する。保存は呼び出し側で行う。 */
  async sendReply(id: string, text: string, by: 'manual' | 'rule' = 'manual'): Promise<StoredMention> {
    const { store } = this.deps;
    const m = store.find(id);
    if (!m) throw new Error(`メンションが見つかりません: ${id}`);
    if (!text.trim()) throw new Error('返信文が空です');
    if (m.status === 'replied' && by === 'rule') throw new Error('すでに返信済みです');
    await this.adapterFor(m.platform).reply(m, text);
    store.recordReply(m.id, text, by);
    return m;
  }
}
