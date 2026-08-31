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

## 検索エンジン向け設定

このサイトはデモ専用のため、Production、Preview、ローカルの全環境でHTMLへ`noindex, nofollow`のrobots metaを付与し、API、raw Markdown、static assetを含む全レスポンスにも`X-Robots-Tag: noindex, nofollow`を付与します。

`/robots.txt`はcrawlerがnoindexを読み取れるよう`Allow: /`とし、`APP_CANONICAL_ORIGIN`を正本とする`/sitemap.xml`を案内します。XML sitemapには公開canonical HTMLだけを列挙し、管理・認証・API・内部ページは含めません。sitemapとnoindexの併用は意図した仕様であり、Search Consoleでは掲載URLがnoindexにより除外されたものとして表示される場合があります。

## セットアップ

### Docker で起動

ローカルに Node.js や PostgreSQL の実行環境を直接用意せず、Docker Compose で開発サーバーと DB を起動できます。

メンテナンス設定は PostgreSQL の `site_maintenance_settings` を正本にします。migrationが`PRODUCTION`、`PREVIEW`、`DEVELOPMENT`の3行をversion 1・`DISABLED`で作成するため、外部storeや追加tokenの準備は不要です。`DATABASE_URL`にはprimary/read-writeのpooling endpointを設定し、read replicaは使用しません。設定行がない、形式が不正、またはDBから読めない場合、公開HTMLは安全側に倒して503のメンテナンス表示になります。`APP_CANONICAL_ORIGIN`は`BETTER_AUTH_URL`と同じoriginにし、Productionではcanonical HTTPS hostnameとの一致だけを`PRODUCTION`として扱います。

緊急解除は管理画面で対象環境を`DISABLED`にするのが第一手段です。認証だけが故障し、DB接続が正常な場合に限り、Neon SQL Editorで[メンテナンスモード緊急解除](docs/deploy/vercel-neon/maintenance-recovery.md)のtransaction SQLを実行します。DB停止中はfail-closedの503を維持し、DBを復旧してから解除を確認します。コードrollbackは設定解除やDB復旧とは別操作です。

```bash
./dev-compose.sh prepare
./dev-compose.sh status
./dev-compose.sh ensure
```

`prepare`はcheckout固有のruntime identityを解決するだけで、Dockerやアプリを起動しません。`status`は現在のCompose project、port、URL、runtime owner、healthを表示します。`ensure`は正しい既存serverがあれば再利用し、存在しない場合だけ起動します。検証に使うURLだけを取得する場合は`./dev-compose.sh status --url`を使います。

Local checkoutは従来どおり[http://localhost:3000](http://localhost:3000)、PostgreSQL `5432`、Prisma Studio `5555`を使用します。同じcheckoutのhealthyなnative Next.js processまたは正しいCompose `web`が起動済みなら、PIDまたはcontainer IDを変えずに再利用します。別checkoutや所有権不明のprocessが`3000`を使っている場合は、そのprocessを停止せずエラーにします。

Codex worktreeはcanonical checkout pathから固有Compose projectとweb・PostgreSQL・Studio portを割り当てます。webは`3100-3899`、PostgreSQLは`15432-16231`、Studioは`25555-26354`のloopback portを使い、DB、volume、network、originもworktreeごとに分離します。割当値は追跡対象外の`.codex/runtime.local.env`に保存されるため、`HOST_PORT`や`COMPOSE_PROJECT_NAME`を手作業で指定しません。wrapperはworktreeだけ`compose.worktree.yaml`を自動適用し、保持するvolumeのcreation identityをsession間で固定するため、次回起動でdatabase再作成を要求しません。

LocalでWebを新規起動する場合だけ、起動時にアクセス範囲を選択します。Enterのみ、または`1`を入力するとこのMacだけ、`2`は同一LAN、`3`はCloudflare Tunnelです。worktreeは常にloopback限定であり、LANとCloudflareには公開しません。

```text
Web access:
  1) This Mac only: http://localhost:3000 (default)
  2) Same network: http://192.168.x.x:3000
  3) Cloudflare Tunnel: https://demo.keien.dev
Select [1/2/3]:
```

Cloudflare Tunnel の初回設定と起動手順は [docs/development/cloudflared-tunnel.md](docs/development/cloudflared-tunnel.md) を参照してください。

LAN 内 IPv4 アドレスは起動のたびに検出されるため、接続先の Wi-Fi などが変わると URL も変わる場合があります。スマートフォンは Mac と同じネットワークへ接続してください。VPN、ゲスト Wi-Fi の端末間通信制限、macOS Firewall などにより接続できない場合があります。

LAN 向けの起動は、開発サーバーを平文 HTTP で同じネットワークへ公開します。信頼できるネットワーク上で開発用データだけを使用し、確認後は Compose を停止してください。PostgreSQL と Prisma Studio はアクセス方式にかかわらず、この Mac からだけ接続できます。

LocalのPrisma Studioは[http://localhost:5555](http://localhost:5555)です。worktreeのStudio portは`./dev-compose.sh status`で確認します。

`./dev-compose.sh`は変更操作のときだけ、必要に応じてColimaを起動します。`prepare`と`status`はColimaを起動しません。WebまたはStudioを起動する前に現在のCompose projectのPrisma migration状態を確認し、未適用migrationがある場合だけ`db:deploy`の承認を求めます。通常のソース変更はHMRを使い、自動的な`web`再起動はmigration適用後に必要な場合だけです。package、Docker、Next.js設定などの変更では暗黙に再起動せず、明示的な`./dev-compose.sh restart web`を案内します。

日常操作でraw `docker compose`は使いません。wrapperが`--project-directory`、project名、runtime envを必ず注入し、別worktreeへの誤操作を防ぎます。

初回起動後や管理画面へのログインが必要になったときは、別ターミナルで最初に初期管理者の状態を確認します。このコマンドはDBを変更せず、パスワードも出力しません。

```bash
./dev-compose.sh exec web npm run db:check-seed-admin
```

結果が`MISSING`の場合だけ、初期管理者 seed を実行してから状態を再確認します。

```bash
./dev-compose.sh exec web npm run db:seed-admin
./dev-compose.sh exec web npm run db:check-seed-admin
```

`PRESENT_STANDARD`はcredential、admin role、ban、パスワード変更要求、FULL_ACCESS assignmentが標準状態であることを示しますが、設定されたパスワードとの一致までは証明しません。まず現在のseed用credentialでログインします。`PRESENT_NONSTANDARD`または既存ユーザーのログイン失敗を理由に`db:seed-admin`を自動実行してはいけません。

ローカル開発DBに限り、既存のseed管理者のパスワードを明示的に復旧する場合は、対象と影響を確認してから次を実行します。

```bash
./dev-compose.sh exec web env NODE_ENV=development CONFIRM_LOCAL_SEED_ADMIN_PASSWORD_RESET=1 npm run db:reset-seed-admin-password
```

このリセットは`SEED_ADMIN_EMAIL`の既存ユーザーだけを対象とし、credential passwordを`SEED_ADMIN_PASSWORD`へ更新してパスワード変更要求を解除し、対象ユーザーの既存sessionを削除します。ユーザーが存在しない場合は作成しません。name、role、ban状態、access role assignmentは変更しません。実行結果にパスワードやhashは出力されません。

初期管理者は compose の既定値では以下です。実行時の値は`.env`または環境変数で上書きされる場合があるため、現在のCompose設定を正本として扱ってください。

```text
SEED_ADMIN_EMAIL=admin@example.local
SEED_ADMIN_PASSWORD=ChangeMe12345!
SEED_ADMIN_NAME=Demo Admin
```

PostgreSQLのデータはcheckout固有のDocker named volumeに保存されます。`./dev-compose.sh stop web studio db`は現在のprojectの明示serviceだけを停止します。Codex worktreeの`./dev-compose.sh cleanup`はsession開始後に作成したことを証明できるcontainerとnetworkだけを削除し、databaseと`node_modules`のvolumeは保持します。DB初期化やvolume削除は自動開発フローに含めません。

API の動作確認は以下で実行できます。

```bash
runtime_url="$(./dev-compose.sh status --url)"
curl "$runtime_url/api/health"
curl -X POST "$runtime_url/api/demo-records" \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello"}'
curl "$runtime_url/api/demo-records"
curl "$runtime_url/docs/privacy-policy.md"
```

この構成では `app/api/[[...route]]/route.ts` の Route Handler 上で Hono を動かし、アプリ固有 API は Prisma Client 経由で PostgreSQL に書き込みます。Better Auth は `app/api/auth/[...all]/route.ts` に専用 mount しています。

### Vercel Hobby + Neon Freeへデプロイ

ローカルからの公開はリポジトリルートの`./deploy.sh`だけを使い、VercelのGit自動デプロイは使用しません。初回にVercel / Neon / 管理者の設定とcredentialをAWS Systems Manager Parameter Storeへ保存した後は、Node.js、Vercel CLI、Neon CLIをhostへ個別にインストールせず、Docker上の固定deploy runnerから再利用します。通常は入力不要で、pending migrationがある場合だけ適用前に1回承認します。

`deploy.sh`は対象、plan、migration、環境変数を再検証し、対象commitをVercel Productionへ直接deployします。最後にPostgreSQLの実効メンテナンス設定に応じた公開HTMLの200 / 503、認証、robots meta、全レスポンスの`X-Robots-Tag`、`/robots.txt`、`/sitemap.xml`をcanonical URLで検証します。手順は次を参照してください。

- [既存Productionの初回設定と切替](docs/deploy/vercel-neon/initial-deploy.md)
- [AWS Parameter Storeの初回設定](docs/deploy/vercel-neon/setup-deploy-aws.md)
- [2回目以降の再デプロイ](docs/deploy/vercel-neon/redeploy.md)
- [GitHub Actions用AWS IAM / OIDC設定](docs/deploy/vercel-neon/aws-iam-oidc.md)
- [GitHub Actionsからの再デプロイ](docs/deploy/vercel-neon/github-actions-redeploy.md)

GitHub ActionsもhostでNode.js / npm / Vercel CLIを実行しません。対象`GITHUB_SHA`のarchiveからdeploy runnerをOIDC取得前にbuildし、短期AWS credentialで取得したSSM responseだけをcontainerのstdinへ渡します。

Vercel Hobbyの対象となる個人・非商用利用であり、本番データや日本国内のデータ所在要件がないデモだけを対象とします。業務・商用利用では適合するVercel planを選んでください。

### npm で起動

Docker を使わずに開発サーバーを起動する場合は、以下を実行します。

```bash
npm install
npm run db:migrate
npm run db:seed-admin
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開くと表示されます。

### UIプロトタイプを確認

`plans/<slug>/prototype/`のモックは、Composeやデータベースを起動せずにlocalhostで確認できます。引数なしではcanonical prototypeから最終更新されたものを選びます。OSが空きポートを自動で割り当てます。

```bash
./dev-prototype.sh
```

対象を明示する場合だけslugを指定します。

```bash
./dev-prototype.sh admin-role-based-access-control
```

表示された`http://127.0.0.1:<port>/`をブラウザで開き、停止するときは`Ctrl+C`を押します。serverはloopbackだけにbindし、対象prototype以外のrepository fileは配信しません。

承認対象のprototypeは、goalに`approval contract: plans/<slug>/prototype/ui-contract.json — version 1`を記録し、page・shell・共通component・global style・tokenを含むbaselineの完全な`sources` inventory、runtime owner・checkout・40桁commit SHA・route、fixture・authorization・queryと`window.scrollX`/`window.scrollY`実測値によるexact `scroll: {x, y}`を含むcomparison conditions、state、theme、responsive、視覚的不変条件、意図した差分、interaction、`comparisonTargets`と不変なparity matrix行定義をmanifestへ同期します。Tailwind CSS build後にartifactと契約をまとめたrevisionを計算します。各targetはID、entry、production route、surface、各行はID、`targetId`、一致するentry/route/surface、state、viewport、theme、breakpoint、期待するinvariant/difference IDを保持します。結果やscreenshot等の可変証拠はmanifest外へ置き、承認時の`machineParityResults`と実装後の`implementationParityResults`で全行を`<row-id>=pending`（未実行）または`<row-id>=pass|fail`（実行後）として過不足なく記録します。bare IDや`all N`は結果になりません。goalの`parity evidence`・machine parity・UI承認を同じrevisionへ紐付け、`$implement`は承認時証跡の日付を流用せず、production編集直前に全sourceのworking tree状態を確認して現在条件で全行をCodexアプリ内Browser再実行します。

```bash
node .agents/skills/plan/scripts/prototype-revision.mjs plans/<slug>/prototype
```

実際のCodex promptでplan系skillをforward testする場合は`npm run eval:plan-skills`を実行します。evalはCodex CLIの`workspace-write` sandboxと一時repository、環境allowlist、出力量上限、artifact allowlistを使い、Codex CLIの認証が必要です。runnerはprocess identity、process group、run marker、一時fixtureをcwdとして保持するprocessを再照合して通常経路をcleanupし、必要なinspectorが利用できなければ結果を受理しません。ただしこれは任意のhostile executableを封じ込めるOS-level security boundaryではありません。CLIにはCodexアプリ内Browserがないため、`$implement`のruntime所有権、build停止・再起動、live parity、cleanupの成功経路は[開発workflowのmanual integration gate](docs/development/codex-development-workflow.md#skill-behavioral-eval)で別途確認します。

## スクリプト

| コマンド | 説明 |
| --- | --- |
| `./dev-compose.sh prepare` | checkout固有のproject、port、originを解決し、serviceを起動せずruntime manifestを用意 |
| `./dev-compose.sh status [--url]` | runtime owner、project、mount、health、検証用URLをread-only確認 |
| `./dev-compose.sh ensure` | 正しい既存serverを再利用し、存在しない場合だけ現在のcheckoutで起動 |
| `./dev-compose.sh restart web` | 明示操作としてverified `web`だけを再起動 |
| `./dev-compose.sh stop <services>` | 現在のprojectの明示serviceだけを停止 |
| `./dev-compose.sh cleanup` | worktree sessionが作成したcontainerとnetworkだけを削除しvolumeを保持 |
| `./dev-prototype.sh [slug]` | 最終更新または指定したUI prototypeを空きlocalhost portで配信 |
| `./dev-compose.sh up studio` | Prisma Studio を Docker 上で起動 |
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 本番ビルドを作成 |
| `npm run start` | 本番サーバーを起動 |
| `npm run lint` | ESLint を実行 |
| `npm run typecheck` | アプリのTypeScript型検査を実行 |
| `npm run audit:runtime` | デプロイ成果物に含まれる依存関係の脆弱性監査を実行 |
| `npm run test:deploy` | Vercel/Neon/PostgreSQLデプロイの安全ゲートをstubで検証 |
| `./setup-deploy-aws.sh` | 初回設定または明示したcredentialをAWS Parameter Storeへ安全に保存・更新 |
| `./deploy.sh` | Docker上でpreflight、必要時のmigration承認、direct Production deploy、canonical smokeを実行 |
| `npm run eval:plan-skills` | 一時repositoryでplan系skillの実prompt behavioral evalを実行 |
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
