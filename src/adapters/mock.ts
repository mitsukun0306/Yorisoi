import type { Mention, SnsAdapter } from '../core/types.ts';

/** APIキー無しで動作確認するための偽アダプタ。`YORISOI_MOCK=1` で有効。 */
export class MockAdapter implements SnsAdapter {
  readonly platform = 'mock' as const;
  readonly sent: { mention: Mention; text: string }[] = [];
  private readonly mentions: Mention[];

  constructor(mentions?: Mention[]) {
    this.mentions = mentions ?? [
      {
        id: 'mock:1',
        platform: 'mock',
        author: 'friend.example',
        authorName: 'ともだち',
        text: '週末のごはん、何時集合にする？',
        createdAt: '2026-11-18T06:00:00.000Z',
        replyRef: {},
      },
      {
        id: 'mock:2',
        platform: 'mock',
        author: 'shop.example',
        text: 'ご注文ありがとうございました！',
        createdAt: '2026-11-18T05:00:00.000Z',
        replyRef: {},
      },
    ];
  }

  async fetchMentions(): Promise<Mention[]> {
    return this.mentions;
  }

  async reply(mention: Mention, text: string): Promise<void> {
    this.sent.push({ mention, text });
  }
}
