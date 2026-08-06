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
- Better Auth（メールアドレス / パスワード認証）
- Prisma ORM
- PostgreSQL
- Docker / Docker Compose
- 多言語対応（i18n）/ ダークモード対応

## セットアップ

### Docker で起動

ローカルに Node.js や PostgreSQL の実行環境を直接用意せず、Docker Compose で開発サーバーと DB を起動できます。

```bash
./dev-compose.sh
```

Web を起動する場合は、起動時にアクセス範囲を選択します。Enter のみ、または `1` を入力すると、この Mac だけでアクセスできる [http://localhost:3000](http://localhost:3000) を使用します。`2` を入力すると、Mac の LAN 内 IPv4 アドレスを自動検出し、同じネットワーク上のスマートフォンなどから開ける `http://192.168.x.x:3000` 形式の URL を表示します。`3` を入力すると Cloudflare Tunnel 用、`4` を入力すると ngrok 無料枠の Dev Domain 用の公開 Origin で Web を起動します。Tunnel は別のターミナルで起動します。

```text
Web access:
  1) This Mac only: http://localhost:3000 (default)
  2) Same network: http://192.168.x.x:3000
  3) Cloudflare Tunnel: https://zoom.keien.dev
  4) ngrok Free: assigned *.ngrok-free.app domain
Select [1/2/3/4]:
```

外部公開の初回設定と起動手順は、[Cloudflare Tunnel](docs/cloudflared-tunnel.md) または [ngrok 無料枠](docs/ngrok-tunnel.md) を参照してください。

LAN 内 IPv4 アドレスは起動のたびに検出されるため、接続先の Wi-Fi などが変わると URL も変わる場合があります。スマートフォンは Mac と同じネットワークへ接続してください。VPN、ゲスト Wi-Fi の端末間通信制限、macOS Firewall などにより接続できない場合があります。

LAN 向けの起動は、開発サーバーを平文 HTTP で同じネットワークへ公開します。信頼できるネットワーク上で開発用データだけを使用し、確認後は Compose を停止してください。PostgreSQL と Prisma Studio はアクセス方式にかかわらず、この Mac からだけ接続できます。

Prisma Studio は [http://localhost:5555](http://localhost:5555) で開けます。ブラウザ上で各テーブルのレコードを確認し、作成・更新・削除できます。
既に `3000` 番ポートを使っている場合は、外側のポートを変えて起動できます。

```bash
HOST_PORT=3001 ./dev-compose.sh
```

Prisma Studio の外側ポートを変える場合は、`STUDIO_PORT` を指定します。

```bash
STUDIO_PORT=5556 ./dev-compose.sh
```

`./dev-compose.sh` は Colima が停止している場合に自動起動します。Web を含む `up` の場合だけアクセス範囲を確認し、`up db`、`up studio`、`down`、`logs`、`ps` などでは確認しません。`web` または `studio` を起動する前に Prisma migration の状態を確認し、未適用 migration がある場合だけ `db:deploy` を実行するか確認します。直接 `docker compose` を実行する場合は localhost 限定で起動するため、事前に `colima start` を実行してください。

初回起動後、別ターミナルで初期管理者 seed を実行します。

```bash
docker compose exec web npm run db:seed-admin
```

初期管理者は compose の既定値では以下です。必要に応じて `.env` または環境変数で上書きしてください。

```text
SEED_ADMIN_EMAIL=admin@example.local
SEED_ADMIN_PASSWORD=ChangeMe12345!
SEED_ADMIN_NAME=Demo Admin
```

PostgreSQL のデータは Docker volume `postgres-data` に保存されます。DB を初期化し直す場合や、依存関係更新後に Docker 側の `node_modules` volume が古くなった場合は、以下を実行します。

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
curl http://localhost:3000/docs/privacy-policy.md
```

この構成では `app/api/[[...route]]/route.ts` の Route Handler 上で Hono を動かし、アプリ固有 API は Prisma Client 経由で PostgreSQL に書き込みます。Better Auth は `app/api/auth/[...all]/route.ts` に専用 mount しています。

Vercel にデプロイする場合、`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` を設定し、Prisma Postgres / Neon / Supabase / Vercel Marketplace の Postgres など `DATABASE_URL` で接続できる PostgreSQL を使ってください。`postinstall` で Prisma Client を生成し、`vercel-build` では `prisma migrate deploy` を実行します。

### npm で起動

Docker を使わずに開発サーバーを起動する場合は、以下を実行します。

```bash
npm install
npm run db:migrate
npm run db:seed-admin
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開くと表示されます。

## スクリプト

| コマンド | 説明 |
| --- | --- |
| `./dev-compose.sh` | Web のアクセス範囲、Colima、Prisma migration 状態を確認して Docker で開発サーバーを起動 |
| `docker compose down -v` | Docker volume を含めて停止・削除 |
| `./dev-compose.sh up studio` | Prisma Studio を Docker 上で起動 |
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 本番ビルドを作成 |
| `npm run start` | 本番サーバーを起動 |
| `npm run lint` | ESLint を実行 |
| `npm run db:generate` | Prisma Client を生成 |
| `npm run db:migrate` | Prisma migration を作成し、ローカル DB に適用 |
| `npm run db:deploy` | Prisma migration をデプロイ先 DB に適用 |
| `npm run db:seed-admin` | 初期管理者を作成または更新 |
| `npm run db:studio` | Prisma Studio を起動 |
| `npm run db:studio:docker` | Docker 用にブラウザ自動起動なしで Prisma Studio を起動 |

## ディレクトリ構成

```
app/
├── api/               # Hono API / Better Auth Route Handler
├── admin/             # 管理画面
├── login/             # ログイン
├── page.tsx           # トップページ
├── layout.tsx         # 共通レイアウト
├── components/        # ヘッダー / フッター / 言語切替 / テーマ切替 など
└── i18n/              # 多言語対応（辞書・Provider）
lib/
├── auth.ts            # Better Auth server config
└── server/            # Prisma / server-only auth helpers
prisma/
└── schema.prisma      # Prisma schema / migrations
```
