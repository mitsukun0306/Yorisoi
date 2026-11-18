import { readFile } from 'node:fs/promises';
import { GmailAdapter } from './adapters/gmail.ts';
import { InstagramAdapter } from './adapters/instagram.ts';
import { SlackAdapter } from './adapters/slack.ts';
import { MockAdapter } from './adapters/mock.ts';
import { DEFAULT_AUTO_REPLY, validateRules, type AutoReplyConfig } from './core/rules.ts';
import type { Notifier, SnsAdapter } from './core/types.ts';
import { ConsoleNotifier } from './notifiers/console.ts';
import { SlackNotifier } from './notifiers/slack.ts';
import { WebhookNotifier, type WebhookFormat } from './notifiers/webhook.ts';

type Env = Record<string, string | undefined>;

/** 環境変数が設定されているSNSだけを有効にする。 */
export function buildAdapters(env: Env): SnsAdapter[] {
  const adapters: SnsAdapter[] = [];
  if (env.INSTAGRAM_ACCESS_TOKEN) {
    adapters.push(
      new InstagramAdapter({
        accessToken: env.INSTAGRAM_ACCESS_TOKEN,
        apiVersion: env.INSTAGRAM_API_VERSION || 'v23.0',
        recentMediaCount: Number(env.INSTAGRAM_RECENT_MEDIA || 10),
        includeDms: env.INSTAGRAM_INCLUDE_DMS === '1',
      }),
    );
  }
  if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN) {
    adapters.push(
      new GmailAdapter({
        clientId: env.GMAIL_CLIENT_ID,
        clientSecret: env.GMAIL_CLIENT_SECRET,
        refreshToken: env.GMAIL_REFRESH_TOKEN,
        query: env.GMAIL_QUERY || 'in:inbox is:unread category:primary -from:me',
        maxResults: Number(env.GMAIL_MAX_RESULTS || 20),
      }),
    );
  }
  if (env.SLACK_USER_TOKEN) {
    adapters.push(new SlackAdapter({ userToken: env.SLACK_USER_TOKEN, dmLimit: Number(env.SLACK_DM_LIMIT || 20) }));
  }
  if (env.YORISOI_MOCK === '1') adapters.push(new MockAdapter());
  return adapters;
}

export function buildNotifiers(env: Env): Notifier[] {
  const notifiers: Notifier[] = [new ConsoleNotifier()];
  if (env.SLACK_BOT_TOKEN && env.SLACK_NOTIFY_USER_ID) {
    notifiers.push(new SlackNotifier({ botToken: env.SLACK_BOT_TOKEN, userId: env.SLACK_NOTIFY_USER_ID }));
  }
  if (env.NOTIFY_WEBHOOK_URL) {
    const format = (env.NOTIFY_WEBHOOK_FORMAT || 'json') as WebhookFormat;
    if (!['discord', 'slack', 'ntfy', 'json'].includes(format)) {
      throw new Error(`NOTIFY_WEBHOOK_FORMAT が不正です: ${format}`);
    }
    notifiers.push(new WebhookNotifier({ url: env.NOTIFY_WEBHOOK_URL, format }));
  }
  return notifiers;
}

export async function loadAutoReply(path: string): Promise<AutoReplyConfig> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_AUTO_REPLY;
    throw err;
  }
  const parsed = JSON.parse(raw) as Partial<AutoReplyConfig>;
  const cfg: AutoReplyConfig = {
    enabled: parsed.enabled === true,
    dryRun: parsed.dryRun !== false,
    rules: parsed.rules ?? [],
  };
  validateRules(cfg.rules);
  return cfg;
}
