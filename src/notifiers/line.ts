import type { Mention, Notifier } from '../core/types.ts';
import type { FetchFn } from '../adapters/http.ts';
import { formatMention } from '../core/format.ts';

/**
 * LINE に通知を送る（LINE Messaging API のプッシュメッセージで自分宛てに送る）。
 *
 * 前提: LINE公式アカウントを作り、Messaging API を有効にしたチャネルの
 * チャネルアクセストークンと、自分のユーザーID（Uから始まる）。自分でその公式アカウントを友だち追加しておく。
 * 無料プランは月の送信数に上限があるため、1回の同期でまとめて1通にする。
 */
export interface LineConfig {
  channelAccessToken: string;
  toUserId: string;
  apiBase?: string;
}

const MAX_ITEMS = 10;
const MAX_TEXT = 5000;

export class LineNotifier implements Notifier {
  readonly name = 'line';
  private readonly config: LineConfig;
  private readonly fetchFn: FetchFn;

  constructor(config: LineConfig, fetchFn: FetchFn = fetch) {
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
    ]
      .join('\n\n')
      .slice(0, MAX_TEXT);
    const res = await this.fetchFn(`${this.config.apiBase ?? 'https://api.line.me'}/v2/bot/message/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.channelAccessToken}` },
      body: JSON.stringify({ to: this.config.toUserId, messages: [{ type: 'text', text }] }),
    });
    if (!res.ok) throw new Error(`LINEへの通知に失敗しました: HTTP ${res.status} ${await res.text()}`);
  }
}
