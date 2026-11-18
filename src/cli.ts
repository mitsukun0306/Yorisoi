import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { bootstrap } from './bootstrap.ts';
import { formatMention } from './core/format.ts';
import type { SyncResult } from './core/yorisoi.ts';
import { InAppNotifier } from './notifiers/in-app.ts';
import { createAppServer } from './server.ts';

const HELP = `Yorisoi — SNSの返信・メンションをまとめて通知し、指示どおりに返信します

使い方:
  npm start                               Yorisoiアプリを起動する（http://localhost:3000）
  npm run yorisoi -- sync                 各SNSから新しい返信を集めて通知する
  npm run yorisoi -- watch [--interval 300]  sync を一定間隔（秒）でくり返す
  npm run yorisoi -- list [--all]         未返信の一覧（--all で全部）
  npm run yorisoi -- reply <ID> <返信文>   指定したメンションに返信する
  npm run yorisoi -- ignore <ID>          対応不要にする

ID は一覧に出るものを前方一致で短く指定できます。
設定は .env（.env.example を参照）と auto-reply.json（auto-reply.example.json を参照）です。`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      all: { type: 'boolean', default: false },
      interval: { type: 'string', default: '300' },
      port: { type: 'string', default: '3000' },
      host: { type: 'string', default: '127.0.0.1' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (!command || values.help) {
    console.log(HELP);
    return 0;
  }

  const env = process.env;
  const inApp = new InAppNotifier();
  const { app, store, adapters } = await bootstrap(env, command === 'serve' ? [inApp] : []);

  switch (command) {
    case 'serve': {
      const seconds = Number(values.interval);
      if (!Number.isFinite(seconds) || seconds < 60) throw new Error('--interval は60秒以上にしてください');
      if (values.host !== '127.0.0.1' && values.host !== 'localhost' && !env.YORISOI_ACCESS_TOKEN) {
        throw new Error('ほかの端末から開けるようにするときは、.env に YORISOI_ACCESS_TOKEN（合言葉）を設定してください');
      }
      const server = createAppServer({
        app,
        store,
        inApp,
        accessToken: env.YORISOI_ACCESS_TOKEN || undefined,
        platforms: adapters.map((a) => a.platform),
        publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
      });
      const port = Number(values.port);
      server.listen(port, values.host, () => console.error(`Yorisoi を開きました: http://${values.host}:${port}`));
      if (adapters.length === 0) console.error('⚠️ 有効なサービスがありません。.env を設定してください（試すだけなら YORISOI_MOCK=1）');
      // 起動直後と、その後は一定間隔で新着を確認する
      for (;;) {
        report(await app.sync());
        await sleep(seconds * 1000);
      }
    }

    case 'sync':
      return report(await app.sync());

    case 'watch': {
      const seconds = Number(values.interval);
      if (!Number.isFinite(seconds) || seconds < 60) throw new Error('--interval は60秒以上にしてください');
      console.error(`${seconds}秒ごとに確認します（Ctrl+C で終了）`);
      for (;;) {
        report(await app.sync());
        await sleep(seconds * 1000);
      }
    }

    case 'list': {
      const items = store.list(values.all ? undefined : { status: ['new', 'notified'] });
      if (items.length === 0) console.log(values.all ? 'まだ何もありません' : '未返信のものはありません 🎉');
      for (const m of items) console.log(formatMention(m) + '\n');
      return 0;
    }

    case 'reply': {
      const [id, ...words] = rest;
      if (!id || words.length === 0) throw new Error('使い方: reply <ID> <返信文>');
      const m = await app.sendReply(id, words.join(' '));
      await store.save();
      console.log(`✅ ${m.author} に返信しました`);
      return 0;
    }

    case 'ignore': {
      const m = rest[0] && store.find(rest[0]);
      if (!m) throw new Error('使い方: ignore <ID>（IDが見つかりません）');
      store.setStatus(m.id, 'ignored');
      await store.save();
      console.log(`対応不要にしました: ${m.id}`);
      return 0;
    }

    default:
      console.error(`不明なコマンドです: ${command}\n\n${HELP}`);
      return 1;
  }
}

function report(r: SyncResult): number {
  if (r.added.length === 0) console.error('新しい返信・メンションはありません');
  for (const e of r.errors) console.error(`⚠️ ${e.platform}: ${e.error}`);
  return r.errors.length > 0 ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(`エラー: ${(err as Error).message}`);
    process.exit(1);
  },
);
