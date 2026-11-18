import type { Mention, Notifier } from '../core/types.ts';
import type { FetchFn } from '../adapters/http.ts';
import { formatMention } from '../core/format.ts';

/**
 * Slack アプリ（ボット）から自分にDMで通知する。
 * 自分のユーザートークンで自分に送るとプッシュ通知が鳴らないため、ボットトークン（xoxb-）を使う。
 *
 * 必要なボットトークンのスコープ: chat:write
 */
export interface SlackNotifierConfig {
  botToken: string;
  /** 通知を受け取る自分のSlackユーザーID（Uから始まる） */
  userId: string;
  apiBase?: string;
}

const MAX_ITEMS = 10;

export class SlackNotifier implements Notifier {
  readonly name = 'slack';
  private readonly config: SlackNotifierConfig;
  private readonly fetchFn: FetchFn;

  constructor(config: SlackNotifierConfig, fetchFn: FetchFn = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  async notify(mentions: Mention[]): Promise<void> {
    if (mentions.length === 0) return;
    const shown = mentions.slice(0, MAX_ITEMS);
    const rest = mentions.length - shown.length;
    const text = [
      `🔔 新しい返信・メッセージが ${mentions.length} 件あります`,
      ...shown.map((m) => formatMention(m, false)),
      ...(rest > 0 ? [`…ほか ${rest} 件`] : []),
    ].join('\n\n');
    const res = await this.fetchFn(`${this.config.apiBase ?? 'https://slack.com/api'}/chat.postMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${this.config.botToken}` },
      // ユーザーIDを channel に指定すると、アプリとのDMに届く
      body: JSON.stringify({ channel: this.config.userId, text, unfurl_links: false }),
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (!res.ok || !body.ok) throw new Error(`Slackへの通知に失敗しました: ${body.error ?? res.status}`);
  }
}
