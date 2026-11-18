import type { Mention, SnsAdapter } from '../core/types.ts';
import { requestJson, type FetchFn } from './http.ts';

/**
 * Gmail API を使うアダプタ。
 *
 * 前提: Google Cloud で OAuth クライアント（デスクトップアプリ）を作り、
 * スコープ gmail.readonly と gmail.send で取得したリフレッシュトークン。
 */
export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** 集める対象のGmail検索条件 */
  query: string;
  maxResults: number;
  /** テスト用 */
  apiBase?: string;
  tokenUrl?: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload: { headers: GmailHeader[] };
}

const header = (m: GmailMessage, name: string) =>
  m.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

/** "山田 太郎 <taro@example.com>" → { name: '山田 太郎', email: 'taro@example.com' } */
export function parseAddress(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || undefined, email: m[2].trim() };
  return { email: from.trim() };
}

/** 日本語の件名もそのまま送れるよう、MIMEのBエンコードにする */
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

export function buildReplyMime(opts: { to: string; subject: string; messageId: string; text: string }): string {
  const subject = /^re:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject}`;
  return [
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(subject)}`,
    ...(opts.messageId ? [`In-Reply-To: ${opts.messageId}`, `References: ${opts.messageId}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.text).toString('base64'),
  ].join('\r\n');
}

export class GmailAdapter implements SnsAdapter {
  readonly platform = 'gmail' as const;
  private token?: { value: string; expiresAt: number };
  private readonly config: GmailConfig;
  private readonly fetchFn: FetchFn;

  constructor(config: GmailConfig, fetchFn: FetchFn = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  private get base() {
    return this.config.apiBase ?? 'https://gmail.googleapis.com/gmail/v1/users/me';
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await requestJson<{ access_token: string; expires_in: number }>(
      this.fetchFn,
      this.config.tokenUrl ?? 'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      },
    );
    this.token = { value: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
    return this.token.value;
  }

  private async get<T>(path: string): Promise<T> {
    return requestJson<T>(this.fetchFn, `${this.base}${path}`, {
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
    });
  }

  async fetchMentions(): Promise<Mention[]> {
    const qs = new URLSearchParams({ q: this.config.query, maxResults: String(this.config.maxResults) });
    const list = await this.get<{ messages?: { id: string }[] }>(`/messages?${qs}`);
    const meta = ['From', 'Subject', 'Message-ID', 'Reply-To'].map((h) => `metadataHeaders=${h}`).join('&');
    const out: Mention[] = [];
    for (const { id } of list.messages ?? []) {
      const m = await this.get<GmailMessage>(`/messages/${id}?format=metadata&${meta}`);
      const from = parseAddress(header(m, 'From'));
      const subject = header(m, 'Subject');
      out.push({
        id: `gmail:${m.id}`,
        platform: 'gmail',
        author: from.email,
        authorName: from.name,
        text: subject ? `【${subject}】${m.snippet}` : m.snippet,
        url: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
        createdAt: new Date(Number(m.internalDate)).toISOString(),
        replyRef: {
          threadId: m.threadId,
          to: header(m, 'Reply-To') || header(m, 'From'),
          subject,
          messageId: header(m, 'Message-ID'),
        },
      });
    }
    return out;
  }

  async reply(mention: Mention, text: string): Promise<void> {
    const r = mention.replyRef;
    const raw = Buffer.from(buildReplyMime({ to: r.to, subject: r.subject, messageId: r.messageId, text })).toString(
      'base64url',
    );
    await requestJson(this.fetchFn, `${this.base}/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
      json: { raw, threadId: r.threadId },
    });
  }
}
