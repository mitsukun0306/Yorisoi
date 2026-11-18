import type { Mention, Platform, SnsAdapter } from '../core/types.ts';

/**
 * APIキー無しで動作確認するための偽アダプタ。`YORISOI_MOCK=1` で有効。
 * 返信は実際には送らず、sent に記録するだけ。
 */
export class MockAdapter implements SnsAdapter {
  readonly platform: Platform;
  readonly sent: { mention: Mention; text: string }[] = [];
  private readonly mentions: Mention[];

  constructor(mentions: Mention[] = [], platform: Platform = 'mock') {
    this.mentions = mentions;
    this.platform = platform;
  }

  async fetchMentions(): Promise<Mention[]> {
    return this.mentions;
  }

  async reply(mention: Mention, text: string): Promise<void> {
    this.sent.push({ mention, text });
  }
}

/** お試し用のサンプル（Instagram・Gmail・Slack のふりをする） */
export function demoAdapters(now = Date.now()): MockAdapter[] {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const m = (platform: Platform, id: string, author: string, text: string, min: number, authorName?: string): Mention => ({
    id: `${platform}:demo:${id}`,
    platform,
    author,
    authorName,
    text,
    createdAt: ago(min),
    replyRef: {},
  });
  return [
    new MockAdapter(
      [
        m('instagram', '1', 'yuki_photo', '夕焼けの写真すごく綺麗！どこで撮ったんですか？', 4),
        m('instagram', '2', 'kenta.run', '(DM) 来週のランニング、土曜の朝で大丈夫？', 95),
      ],
      'instagram',
    ),
    new MockAdapter(
      [
        m('gmail', '1', 'tanaka@example.com', '【打ち合わせ日程のご相談】来週の火曜か水曜の午後はいかがでしょうか。', 32, '田中 さくら'),
      ],
      'gmail',
    ),
    new MockAdapter(
      [
        m('slack', '1', 'aoki', '#project: @mitsu 資料のレビューお願いできますか？今日中だと助かります', 12, '青木'),
      ],
      'slack',
    ),
  ];
}
