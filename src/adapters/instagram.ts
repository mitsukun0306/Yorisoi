import type { Mention, SnsAdapter } from '../core/types.ts';
import { requestJson, type FetchFn } from './http.ts';

/**
 * Instagram の公式API（Instagram API with Instagram Login）を使うアダプタ。
 *
 * 前提:
 * - Instagram がプロアカウント（ビジネス or クリエイター）であること。個人アカウントはAPIで扱えない。
 * - Meta for Developers で作ったアプリから発行したアクセストークン。
 *   権限: instagram_business_basic, instagram_business_manage_comments
 *   （DMも扱うなら instagram_business_manage_messages）
 *
 * 集めるもの:
 * - 自分の最近の投稿に付いたコメント（とコメントへの返信）
 * - DM（includeDms が true のとき）
 */
export interface InstagramConfig {
  accessToken: string;
  /** 例: v23.0 */
  apiVersion: string;
  /** コメントを見に行く最近の投稿の数 */
  recentMediaCount: number;
  includeDms: boolean;
  /** テスト用。通常は https://graph.instagram.com */
  baseUrl?: string;
}

interface Me {
  user_id: string;
  username: string;
}

interface IgComment {
  id: string;
  text?: string;
  username?: string;
  timestamp: string;
  from?: { id: string; username: string };
  replies?: { data: IgComment[] };
}

interface IgMedia {
  id: string;
  permalink?: string;
  comments?: { data: IgComment[] };
}

interface IgMessage {
  id: string;
  message?: string;
  created_time: string;
  from: { id: string; username?: string };
}

interface IgConversation {
  id: string;
  messages?: { data: IgMessage[] };
}

export class InstagramAdapter implements SnsAdapter {
  readonly platform = 'instagram' as const;
  private me?: Me;
  private readonly config: InstagramConfig;
  private readonly fetchFn: FetchFn;

  constructor(config: InstagramConfig, fetchFn: FetchFn = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  private url(path: string, params: Record<string, string> = {}): string {
    const base = (this.config.baseUrl ?? 'https://graph.instagram.com').replace(/\/$/, '');
    const qs = new URLSearchParams({ ...params, access_token: this.config.accessToken });
    return `${base}/${this.config.apiVersion}${path}?${qs}`;
  }

  private async whoami(): Promise<Me> {
    this.me ??= await requestJson<Me>(this.fetchFn, this.url('/me', { fields: 'user_id,username' }));
    return this.me;
  }

  async fetchMentions(): Promise<Mention[]> {
    const me = await this.whoami();
    const results = [...(await this.fetchComments(me))];
    if (this.config.includeDms) results.push(...(await this.fetchDms(me)));
    return results;
  }

  private async fetchComments(me: Me): Promise<Mention[]> {
    const commentFields = 'id,text,username,timestamp,from';
    const res = await requestJson<{ data: IgMedia[] }>(
      this.fetchFn,
      this.url('/me/media', {
        fields: `id,permalink,comments{${commentFields},replies{${commentFields}}}`,
        limit: String(this.config.recentMediaCount),
      }),
    );
    const out: Mention[] = [];
    const isMine = (c: IgComment) => (c.username ?? c.from?.username) === me.username;
    for (const media of res.data) {
      for (const top of media.comments?.data ?? []) {
        // Instagramのコメントは1段しかネストしないので、返信先はいつも一番上のコメント
        for (const c of [top, ...(top.replies?.data ?? [])]) {
          if (isMine(c)) continue;
          const author = c.username ?? c.from?.username ?? 'unknown';
          out.push({
            id: `instagram:comment:${c.id}`,
            platform: 'instagram',
            author,
            text: c.text ?? '',
            url: media.permalink,
            createdAt: new Date(c.timestamp).toISOString(),
            replyRef: { kind: 'comment', commentId: top.id, author },
          });
        }
      }
    }
    return out;
  }

  private async fetchDms(me: Me): Promise<Mention[]> {
    const res = await requestJson<{ data: IgConversation[] }>(
      this.fetchFn,
      this.url('/me/conversations', {
        platform: 'instagram',
        fields: 'id,messages.limit(5){id,message,created_time,from}',
      }),
    );
    const out: Mention[] = [];
    for (const conv of res.data) {
      for (const msg of conv.messages?.data ?? []) {
        if (msg.from.id === me.user_id || msg.from.username === me.username) continue;
        out.push({
          id: `instagram:dm:${msg.id}`,
          platform: 'instagram',
          author: msg.from.username ?? msg.from.id,
          text: msg.message ?? '（テキスト以外のメッセージ）',
          createdAt: new Date(msg.created_time).toISOString(),
          replyRef: { kind: 'dm', recipientId: msg.from.id },
        });
      }
    }
    return out;
  }

  async reply(mention: Mention, text: string): Promise<void> {
    const r = mention.replyRef;
    if (r.kind === 'comment') {
      // 相手に通知が届くよう @ユーザー名 を付ける
      const body = text.includes(`@${r.author}`) ? text : `@${r.author} ${text}`;
      await requestJson(this.fetchFn, this.url(`/${r.commentId}/replies`, { message: body }), { method: 'POST' });
      return;
    }
    if (r.kind === 'dm') {
      // Instagramの仕様で、DMは相手の最後のメッセージから24時間以内しか返信できない
      await requestJson(this.fetchFn, this.url('/me/messages'), {
        method: 'POST',
        json: { recipient: { id: r.recipientId }, message: { text } },
      });
      return;
    }
    throw new Error(`返信できない種類です: ${r.kind}`);
  }
}
