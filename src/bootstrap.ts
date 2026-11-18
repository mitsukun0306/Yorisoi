import { buildAdapters, buildNotifiers, loadAutoReply } from './config.ts';
import { MentionStore } from './core/store.ts';
import { Yorisoi } from './core/yorisoi.ts';
import type { Notifier } from './core/types.ts';

type Env = Record<string, string | undefined>;

/** .env の内容から Yorisoi 本体を組み立てる（CLI とアプリのサーバーで共通）。 */
export async function bootstrap(env: Env, extraNotifiers: Notifier[] = []) {
  const store = new MentionStore(env.YORISOI_DATA_FILE || 'data/mentions.json');
  await store.load();
  const adapters = buildAdapters(env);
  const app = new Yorisoi({
    adapters,
    notifiers: [...buildNotifiers(env), ...extraNotifiers],
    store,
    autoReply: await loadAutoReply(env.YORISOI_AUTO_REPLY_FILE || 'auto-reply.json'),
  });
  return { app, store, adapters };
}
