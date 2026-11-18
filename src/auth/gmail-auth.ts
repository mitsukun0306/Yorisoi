import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { updateEnvFile } from '../env-file.ts';

/**
 * Gmail のリフレッシュトークンを取得して .env に書き込む。
 *
 * 使い方: .env に GMAIL_CLIENT_ID と GMAIL_CLIENT_SECRET を入れてから `npm run auth:gmail`。
 * ブラウザでGoogleの同意画面が開くので、許可すると .env の GMAIL_REFRESH_TOKEN が自動で埋まる。
 * トークンは画面にもチャットにも出さない。
 */
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args as string[], { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* 開けなければ表示したURLを手で開いてもらう */
  }
}

async function main(): Promise<void> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('.env に GMAIL_CLIENT_ID と GMAIL_CLIENT_SECRET を入れてから実行してください');
  }
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');

  const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') return void res.writeHead(404).end();
      const done = (msg: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<p style="font:16px sans-serif;margin:3em">${msg}</p>`);
        server.close();
      };
      if (url.searchParams.get('state') !== state) {
        done('確認に失敗しました。もう一度 npm run auth:gmail を実行してください。');
        return reject(new Error('state が一致しません'));
      }
      const c = url.searchParams.get('code');
      if (!c) {
        done('許可されませんでした。このタブは閉じてかまいません。');
        return reject(new Error(`許可されませんでした: ${url.searchParams.get('error')}`));
      }
      done('Gmail の接続ができました。このタブを閉じてターミナルに戻ってください。');
      resolve({ code: c, redirectUri });
    });
    let redirectUri = '';
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();
      console.log('ブラウザでGoogleの画面が開きます。開かなければ次のURLを開いてください:\n');
      console.log(auth.toString() + '\n');
      openBrowser(auth.toString());
    });
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code.code,
      code_verifier: verifier,
      redirect_uri: code.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const body = (await res.json()) as { refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.refresh_token) {
    throw new Error(`トークンを取得できませんでした: ${body.error_description ?? body.error ?? res.status}`);
  }
  await updateEnvFile('.env', { GMAIL_REFRESH_TOKEN: body.refresh_token });
  console.log('✅ .env に GMAIL_REFRESH_TOKEN を保存しました。npm start で Yorisoi を起動できます。');
}

main().catch((err) => {
  console.error(`エラー: ${(err as Error).message}`);
  process.exit(1);
});
