# Yorisoi のつなぎ方（Windows）

キーやトークンは **.env にだけ** 書き、チャットやメールには貼らないでください。

> **PowerShell で `npm` が「スクリプトの実行が無効」と止められるときは**、`npm` の代わりに
> `npm.cmd` と打ってください（例: `npm.cmd start`、`npm.cmd run auth:gmail`）。セキュリティ設定は変えずに済みます。

## 0. PCの準備

1. Node.js 22（LTS）以上と Git を入れる（PowerShell で）
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install Git.Git
   ```
2. Yorisoi を取ってきて準備する
   ```powershell
   cd $HOME\Documents
   git clone https://github.com/mitsukun0306/Yorisoi.git
   cd Yorisoi
   npm install
   copy .env.example .env
   ```
3. 試しに起動する: `npm start` → ブラウザで http://localhost:3000

## 1. Gmail

1. https://console.cloud.google.com/ で新しいプロジェクト「Yorisoi」を作る
2. 「APIとサービス」→「ライブラリ」で **Gmail API** を検索して「有効にする」
3. 「Google Auth Platform」（OAuth 同意画面）を設定する
   - アプリ名: Yorisoi / ユーザーの種類: **外部** / 連絡先: 自分のメール
   - 「対象」で自分のGmailをテストユーザーに追加
   - 「対象」の公開ステータスを **本番環境に公開** にする
     （テストのままだと7日ごとに接続が切れます。自分しか使わないので審査は不要です）
4. 「クライアント」→「クライアントを作成」→ 種類 **デスクトップアプリ** → 作成
5. 表示されたクライアントIDとシークレットを .env に入れる
   ```
   GMAIL_CLIENT_ID=（クライアントID）
   GMAIL_CLIENT_SECRET=（クライアントシークレット）
   ```
6. `npm run auth:gmail` を実行 → ブラウザで自分のアカウントを選んで許可
   - 「Google はこのアプリを確認していません」と出たら「詳細」→「Yorisoi（安全ではないページ）に移動」
   - 終わると .env の `GMAIL_REFRESH_TOKEN` が自動で埋まります

## 2. Slack

1. https://api.slack.com/apps →「Create New App」→「From a manifest」→ ワークスペースを選ぶ
2. このリポジトリの `setup/slack-app-manifest.json` の中身を貼り付けて作成
3. 「Install to Workspace」→ 許可（会社のワークスペースでは管理者の承認が必要な場合があります）
4. 「OAuth & Permissions」の **User OAuth Token**（`xoxp-` で始まる）を .env に入れる
   ```
   SLACK_USER_TOKEN=xoxp-...
   ```

## 3. Instagram

1. Instagram アプリで、アカウントを **プロアカウント**（クリエイター or ビジネス）に切り替える
   （設定 → アカウントの種類とツール → プロアカウントに切り替える。無料）
2. https://developers.facebook.com/apps →「アプリを作成」
   - ユースケースは「Instagramでメッセージとコンテンツを管理」
3. 「Instagramログインを使ったAPI設定」→「アクセストークンを生成」→ 自分のInstagramでログインして許可
4. 表示されたトークンを .env に入れる
   ```
   INSTAGRAM_ACCESS_TOKEN=...
   ```
   - このトークンは約60日で切れます（更新の仕組みは今後 Yorisoi に追加します）
   - DM も集めたい場合は `INSTAGRAM_INCLUDE_DMS=1`。開発中のアプリでは、DMの取得に制限がかかる場合があります

## 4. 起動

```powershell
npm start
```

http://localhost:3000 を開き、「新着を確認」で各サービスから集まれば完了です。
つながらないサービスがあると、画面下にサービス名が表示されます。
