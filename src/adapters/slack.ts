import type { Mention, SnsAdapter } from '../core/types.ts';
import { requestJson, type FetchFn } from './http.ts';

/**
 * Slack Web API を使うアダプタ。自分のユーザートークン（xoxp-）で動き、返信も自分の名前で投稿する。
 *
 * 必要なユーザートークンのスコープ:
 *   search:read（メンション検索）, im:read, im:history（DM）, users:read（名前の表示）, chat:write（返信）
 */
export interface SlackConfig {
  userToken: string;
  /** DMを見に行く会話の数 */
  dmLimit: number;
  apiBase?: string;
}

interface SlackResponse {
  ok: boolean;
  error?: string;
}

interface SearchMatch {
  ts: string;
  text: string;
  user?: string;
  username?: string;
  permalink?: string;
  channel: { id: string; name?: string; is_im?: boolean };
}

interface HistoryMessage {
  ts: string;
  text: string;
  user?: string;
  thread_ts?: string;
  subtype?: string;
}

const tsToIso = (ts: string) => new Date(Number(ts) * 1000).toISOString();

export class SlackAdapter implements SnsAdapter {
  readonly platform = 'slack' as const;
  private me?: { user_id: string; team_id: string; url: string };
  private readonly names = new Map<string, string>();
  private readonly config: SlackConfig;
  private readonly fetchFn: FetchFn;

  constructor(config: SlackConfig, fetchFn: FetchFn = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  private async call<T extends SlackResponse>(method: string, params: Record<string, string> = {}, post = false) {
    const base = this.config.apiBase ?? 'https://slack.com/api';
    const headers = { Authorization: `Bearer ${this.config.userToken}` };
    const res = post
      ? await requestJson<T>(this.fetchFn, `${base}/${method}`, { method: 'POST', headers, json: params })
      : await requestJson<T>(this.fetchFn, `${base}/${method}?${new URLSearchParams(params)}`, { headers });
    // Slackはエラーでも HTTP 200 で ok:false を返す
    if (!res.ok) throw new Error(`Slack ${method}: ${res.error}`);
    return res;
  }

  private async whoami() {
    this.me ??= await this.call<SlackResponse & { user_id: string; team_id: string; url: string }>('auth.test');
    return this.me;
  }

  private async userName(id: string): Promise<string> {
    if (!this.names.has(id)) {
      try {
        const r = await this.call<SlackResponse & { user: { name: string; profile?: { display_name?: string } } }>(
          'users.info',
          { user: id },
        );
        this.names.set(id, r.user.profile?.display_name || r.user.name);
      } catch {
        this.names.set(id, id);
      }
    }
    return this.names.get(id)!;
  }

  async fetchMentions(): Promise<Mention[]> {
    const me = await this.whoami();
    return [...(await this.fetchChannelMentions(me.user_id)), ...(await this.fetchDms(me.user_id, me.url))];
  }

  private async fetchChannelMentions(myId: string): Promise<Mention[]> {
    const r = await this.call<SlackResponse & { messages: { matches: SearchMatch[] } }>('search.messages', {
      query: `<@${myId}>`,
      sort: 'timestamp',
      count: '20',
    });
    const out: Mention[] = [];
    for (const m of r.messages.matches) {
      if (m.user === myId || m.channel.is_im) continue;
      // スレッド内のメッセージならそのスレッドに、そうでなければそのメッセージにスレッド返信する
      const threadTs = m.permalink ? new URL(m.permalink).searchParams.get('thread_ts') : null;
      out.push({
        id: `slack:${m.channel.id}:${m.ts}`,
        platform: 'slack',
        author: m.username ?? (m.user ? await this.userName(m.user) : 'unknown'),
        text: m.channel.name ? `#${m.channel.name}: ${m.text}` : m.text,
        url: m.permalink,
        createdAt: tsToIso(m.ts),
        replyRef: { channel: m.channel.id, threadTs: threadTs ?? m.ts },
      });
    }
    return out;
  }

  private async fetchDms(myId: string, workspaceUrl: string): Promise<Mention[]> {
    const list = await this.call<SlackResponse & { channels: { id: string; user: string }[] }>('conversations.list', {
      types: 'im',
      limit: String(this.config.dmLimit),
    });
    const out: Mention[] = [];
    for (const im of list.channels) {
      const h = await this.call<SlackResponse & { messages: HistoryMessage[] }>('conversations.history', {
        channel: im.id,
        limit: '5',
      });
      for (const m of h.messages) {
        if (!m.user || m.user === myId || m.subtype) continue;
        out.push({
          id: `slack:${im.id}:${m.ts}`,
          platform: 'slack',
          author: await this.userName(m.user),
          text: `(DM) ${m.text}`,
          url: `${workspaceUrl.replace(/\/$/, '')}/archives/${im.id}/p${m.ts.replace('.', '')}`,
          createdAt: tsToIso(m.ts),
          // DMはスレッドにせず、そのまま会話に返す（スレッド中のDMならそのスレッドへ）
          replyRef: { channel: im.id, ...(m.thread_ts ? { threadTs: m.thread_ts } : {}) },
        });
      }
    }
    return out;
  }

  async reply(mention: Mention, text: string): Promise<void> {
    const { channel, threadTs } = mention.replyRef;
    await this.call('chat.postMessage', { channel, text, ...(threadTs ? { thread_ts: threadTs } : {}) }, true);
  }
}
