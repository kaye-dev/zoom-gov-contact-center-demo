# 市区町村デモサイト（Zoom 製品デモ用）

Zoom 製品のデモ用に作成した、架空の市区町村ホームページのデモサイトです。

自治体の窓口を想定し、ホームページ上から以下の Zoom 製品の動線を体験できることを目的としています。

- **Zoom Virtual Agent** — HP 上にチャットボットを配置し、住民からの問い合わせに自動応答するデモ
- **Zoom Contact Center / Zoom Phone** — Virtual Agent からの有人対応へのエスカレーション、および HP に掲載した電話番号からの着信デモ

## 技術スタック

- [Next.js](https://nextjs.org) 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Hono（Next.js Route Handler 上の API）
- Drizzle ORM
- SQLite（ローカルファイル DB）
- Docker / Docker Compose
- 多言語対応（i18n）/ ダークモード対応

## セットアップ

### Docker で起動

ローカルに Node.js や SQLite の実行環境を直接用意せず、Docker Compose で開発サーバーを起動できます。

```bash
docker compose up --build
```

[http://localhost:3000](http://localhost:3000) をブラウザで開くと表示されます。
既に `3000` 番ポートを使っている場合は、外側のポートを変えて起動できます。

```bash
HOST_PORT=3001 docker compose up --build
```

SQLite のデータは Docker volume `sqlite-data` に保存されます。DB を初期化し直す場合や、依存関係更新後に Docker 側の `node_modules` volume が古くなった場合は、以下を実行します。

```bash
docker compose down -v
```

API の動作確認は以下で実行できます。

```bash
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/demo-records \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello"}'
curl http://localhost:3000/api/demo-records
```

この構成では `app/api/[[...route]]/route.ts` の Route Handler 上で Hono を動かし、DB アクセスは Drizzle ORM 経由で SQLite ファイルに書き込みます。Docker では `DATABASE_PATH=/data/app.sqlite` を指定し、ローカルの npm 実行では未指定時に `.local/data/app.sqlite` を使います。

Vercel にデプロイする場合、Route Handler は Vercel Functions として動きます。Vercel の Serverless Functions ではローカルファイル SQLite を永続 DB として扱えないため、この SQLite 構成はローカル開発・デモ用途です。Vercel 上で `DATABASE_PATH` が未指定の場合は `/tmp/app.sqlite` を使いますが、一時ファイルのため永続化されません。本番の書き込み API では Turso/libSQL、Postgres、Vercel Storage などの永続 DB に差し替える想定です。

### npm で起動

Docker を使わずに開発サーバーを起動する場合は、以下を実行します。

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開くと表示されます。

## スクリプト

| コマンド | 説明 |
| --- | --- |
| `docker compose up --build` | Docker で開発サーバーを起動 |
| `docker compose down -v` | Docker volume を含めて停止・削除 |
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 本番ビルドを作成 |
| `npm run start` | 本番サーバーを起動 |
| `npm run lint` | ESLint を実行 |
| `npm run db:generate` | Drizzle migration を生成 |
| `npm run db:push` | Drizzle schema を DB に反映 |
| `npm run db:studio` | Drizzle Studio を起動 |

## ディレクトリ構成

```
app/
├── api/               # Hono / Route Handler API
├── page.tsx           # トップページ
├── layout.tsx         # 共通レイアウト
├── components/        # ヘッダー / フッター / 言語切替 / テーマ切替 など
└── i18n/              # 多言語対応（辞書・Provider）
lib/
└── server/            # SQLite などサーバー専用処理
```
