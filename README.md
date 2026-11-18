# Yorisoi（よりそい）

人生をサポートしてくれる個人用アプリ。

## 第一弾: メッセージの集約・通知・返信

Instagram・Gmail・Slack に届いた「自分宛ての返信・メッセージ」を Yorisoi アプリの受信箱に集め、
新着を通知し、アプリから返信します。返信は自分が指示したときだけ送られます。

## アプリ（Webアプリ・スマホ対応）

```sh
npm install
cp .env.example .env   # 使うサービスのキーだけ入れる
npm start              # http://localhost:3000 を開く
```

- 受信箱に全サービスの未返信がまとまり、サービスごとに絞り込めます。
- 各メッセージの下の欄から、そのまま元のサービスに返信できます（Ctrl/⌘+Enter でも送信）。「対応不要」で一覧から外せます。
- 起動中は5分ごと（`--interval` 秒で変更可）に新着を確認し、画面に即時反映します。「通知をオン」にすると、ブラウザの通知でも知らせます。
- スマホでは、ブラウザの「ホーム画面に追加」でアプリのように使えます。
- APIキー無しで画面を試すには `.env` に `YORISOI_MOCK=1` を入れます（サンプルが表示され、返信は実際には送られません）。

### スマホから使うとき

初期状態では、起動したPC（`127.0.0.1`）からしか開けません。スマホから開くには、`.env` に合言葉
`YORISOI_ACCESS_TOKEN` を設定し、`npm start -- --host 0.0.0.0` で起動します（合言葉が無いと起動しません）。
外出先から使う場合は、Tailscale などの自分専用ネットワーク経由にするのがおすすめです。

| サービス | 集めるもの | 返信 | 使う公式API |
| --- | --- | --- | --- |
| Instagram | 自分の最近の投稿へのコメント、DM（任意） | コメントへの返信、DMへの返信 | Instagram API with Instagram Login |
| Gmail | 条件に合う未読メール（初期値: メインの受信トレイの未読） | 同じスレッドに返信 | Gmail API |
| Slack | 自分へのメンション、DM | スレッド返信 / DM返信（自分の名前で） | Slack Web API（ユーザートークン） |

### できないこと（各サービスの仕様による制限）

- **LINE は対象外です。** 個人アカウントのトークを外部から読む公式APIが無いためです。
- **Instagram は個人アカウントでは使えません。** プロアカウント（ビジネス or クリエイター、無料で切り替え可）が必要です。
- Instagram の DM は、相手の最後のメッセージから 24 時間以内しか返信できません。
- Instagram のアクセストークンは約60日で期限が切れるので、更新が必要です。

## ほかの通知先（任意）

通知はアプリに集まります。必要なら次にも同時に届けられます。

- **Slack**：自作の Slack アプリから自分にDMが届きます（`SLACK_BOT_TOKEN` と `SLACK_NOTIFY_USER_ID`）。
- **Webhook**：Discord / Slack / ntfy などに送れます（`NOTIFY_WEBHOOK_URL` と `NOTIFY_WEBHOOK_FORMAT`）。

## コマンドで使う場合

Node.js 22.18 以上が必要です（TypeScriptをそのまま実行します）。

```sh
npm run yorisoi -- sync           # 新しいものを集めて通知
npm run yorisoi -- list           # 未返信の一覧
npm run yorisoi -- reply <ID> 返信文   # 返信する（IDは前方一致でOK）
npm run yorisoi -- ignore <ID>    # 対応不要にする
npm run yorisoi -- watch --interval 300   # 5分ごとに sync をくり返す
```

集めたものは `data/mentions.json` に保存されます（Gitには含まれません）。

## 自動返信

返信は **自分が `reply` で指示したとき** か、**自分で書いたルールに一致したとき** だけ送られます。
`auto-reply.example.json` を `auto-reply.json` にコピーして編集します。

- 初期状態は `"enabled": false`（自動返信しない）、`"dryRun": true`（送らずに「送る予定」を表示するだけ）。
  動きを確認してから `dryRun` を `false` にしてください。
- 誰にでも返信してしまわないよう、各ルールには `from`（相手）か `contains`（本文の語）が必須です。
- サービスを初めて同期したときに取り込んだ過去の分には自動返信しません。

## 構成

```
src/
  cli.ts              コマンド（npm start はここの serve）
  server.ts           アプリのサーバー（画面とAPI）
  bootstrap.ts        .env から本体を組み立てる
  config.ts           .env から使うサービスと通知先を組み立てる
  core/
    yorisoi.ts        集約 → 保存 → 通知 → 自動返信 の本体
    store.ts          JSONファイルへの保存
    rules.ts          自動返信ルール
    types.ts          共通の型（SnsAdapter / Notifier）
  adapters/           サービスごとの取得と返信（instagram / gmail / slack / mock）
  notifiers/          通知先（in-app / console / slack / webhook）
public/               アプリの画面（HTML/CSS/JS、外部ライブラリなし）
test/                 node:test によるテスト（APIは偽のfetchで置き換え）
```

新しいサービスを足すときは `SnsAdapter`（`fetchMentions` と `reply`）を実装したファイルを
`src/adapters/` に追加し、`src/config.ts` で有効にします。

## 開発

```sh
npm test           # テスト
npm run typecheck  # 型チェック
```
