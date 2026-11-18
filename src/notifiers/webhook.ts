import type { Mention, Notifier } from '../core/types.ts';
import type { FetchFn } from '../adapters/http.ts';
import { formatMention } from '../core/format.ts';

/** 通知先の形式。Discord / Slack / ntfy / そのままのJSON に対応。 */
export type WebhookFormat = 'discord' | 'slack' | 'ntfy' | 'json';

export interface WebhookConfig {
  url: string;
  format: WebhookFormat;
}

/** 1回の通知に載せる件数の上限（多すぎると読めないので） */
const MAX_ITEMS = 10;

export class WebhookNotifier implements Notifier {
  readonly name = 'webhook';
  private readonly config: WebhookConfig;
  private readonly fetchFn: FetchFn;

  constructor(config: WebhookConfig, fetchFn: FetchFn = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  async notify(mentions: Mention[]): Promise<void> {
    if (mentions.length === 0) return;
    const shown = mentions.slice(0, MAX_ITEMS);
    const rest = mentions.length - shown.length;
    const text = [
      `🔔 新しい返信・メンションが ${mentions.length} 件あります`,
      ...shown.map((m) => formatMention(m, false)),
      ...(rest > 0 ? [`…ほか ${rest} 件`] : []),
    ].join('\n\n');

    let init: RequestInit;
    switch (this.config.format) {
      case 'discord':
        init = json({ content: text.slice(0, 2000) });
        break;
      case 'slack':
        init = json({ text });
        break;
      case 'ntfy':
        init = { method: 'POST', body: text, headers: { Title: 'Yorisoi' } };
        break;
      case 'json':
        init = json({ text, mentions });
        break;
    }
    const res = await this.fetchFn(this.config.url, init);
    if (!res.ok) throw new Error(`通知の送信に失敗しました: HTTP ${res.status}`);
  }
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
