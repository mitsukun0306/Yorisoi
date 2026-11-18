/** SNSの種類。新しいSNSを足すときはここに名前を追加し、アダプタを1つ書く。 */
export type Platform = 'instagram' | 'gmail' | 'slack' | 'mock';

/** 各SNSから集めた「自分宛ての返信・メンション」を共通の形にしたもの。 */
export interface Mention {
  /** Yorisoi内で一意なID（`<platform>:<SNS側のID>`） */
  id: string;
  platform: Platform;
  /** 相手のハンドル（例: Instagramのユーザー名、メールアドレス、Slackの表示名） */
  author: string;
  authorName?: string;
  text: string;
  /** ブラウザで開けるURL（取れる場合） */
  url?: string;
  /** SNS上の投稿日時（ISO 8601） */
  createdAt: string;
  /** 返信するときにアダプタが必要とする情報（SNSごとに中身が違う） */
  replyRef: Record<string, string>;
}

export type MentionStatus = 'new' | 'notified' | 'replied' | 'ignored';

export interface StoredMention extends Mention {
  status: MentionStatus;
  fetchedAt: string;
  reply?: { text: string; sentAt: string; by: 'manual' | 'rule' };
}

/** SNSごとのアダプタが実装するインターフェース。 */
export interface SnsAdapter {
  readonly platform: Platform;
  /** 自分宛ての返信・メンションを新しいものから取得する。 */
  fetchMentions(): Promise<Mention[]>;
  /** 指定したメンションに返信を投稿する。 */
  reply(mention: Mention, text: string): Promise<void>;
}

/** 通知の送り先（コンソール、Webhookなど）。 */
export interface Notifier {
  readonly name: string;
  notify(mentions: Mention[]): Promise<void>;
}
