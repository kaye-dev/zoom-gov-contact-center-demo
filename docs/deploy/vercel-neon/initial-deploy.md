# Vercel / Neonへ新規デプロイ

この手順は、[Vercel Hobby](https://vercel.com/docs/plans/hobby)の対象となる個人・非商用のデモ環境向けです。本番データや、日本国内に保存する必要があるデータには使用しません。2回目以降は[再デプロイ](redeploy.md)を参照してください。

## 1. ローカル環境を準備する

デプロイ対象をcommitし、worktreeをcleanにします。

```bash
cd /Users/keien/dev/zoom/zoom-gov-contact-center-demo
git status --short
node --version
```

`git status --short`は何も表示されず、Node.jsは`v24.x`である必要があります。CLIがなければインストールします。

```bash
# Node.js 24がないmacOSの場合
brew install node@24
export PATH="$(brew --prefix node@24)/bin:$PATH"
hash -r

npm install -g vercel@latest
npm install -g neon@latest
# macOSでは、直前のNeon npm installの代わりに次も選択可
# brew install neonctl
```

## 2. Vercel projectを準備する

Vercel Dashboardの`New Project`はGit repository、template、uploadからの作成画面です。この手順では使用せず、リポジトリルートで認証して、自分だけのHobby scopeへGit未接続の空projectをCLIで作成します。`<Hobby scope>`はDashboard左上に`Hobby`と表示されるscopeのslugへ置き換えてください。

```bash
vercel login
vercel project add zoom-gov-contact-center-demo --scope "<Hobby scope>"
vercel link --yes --scope "<Hobby scope>" --project zoom-gov-contact-center-demo
```

最後の`vercel link`が`.vercel/project.json`を作成し、ローカルのdirectoryを選択したVercel projectとscopeへ紐づけます。以降のVercel CLIと`deploy.sh`はこのlink情報を使って同じprojectを選択します。次のコマンドでファイルの生成と実際のlink先を確認してください。

```bash
test -f .vercel/project.json && echo ".vercel/project.json created"
vercel project inspect --no-color
```

`Name`が`zoom-gov-contact-center-demo`、`Owner`が選択したHobby scopeであることを確認します。想定と異なる場合はデプロイへ進まず、正しいscopeと既存projectを指定して`vercel link`をやり直してください。

`.vercel/project.json`はproject IDとowner IDを保持するlocal metadataです。`.vercel`directory全体が`.gitignore`の対象であり、手動作成・編集・commit・他の利用者との共有はしません。新しいcloneやworktreeではファイルが存在しないため、既存projectに対する`vercel link`だけを再実行します。既存projectがある場合は`vercel project add`を再実行しないでください。

コマンドの仕様は[`vercel project`](https://vercel.com/docs/cli/project)と[`vercel link`](https://vercel.com/docs/cli/link)を参照してください。`vercel link`が`.env.local`へ`VERCEL_OIDC_TOKEN`をダウンロードした場合だけ、次のblockを実行します。`.env.local`がなければ飛ばしてください。値を表示せず、想定したkeyだけを含む通常ファイルであることを確認して削除し、確認が失敗した場合は削除せず停止します。

```bash
(
  set -euo pipefail
  repo_root="$(git rev-parse --show-toplevel)"
  current_dir="$(pwd -P)"
  origin_url="$(git remote get-url origin)"
  [ -n "$repo_root" ] &&
    [ "$repo_root" = "$current_dir" ] &&
    [ "$(basename "$repo_root")" = zoom-gov-contact-center-demo ] &&
    printf '%s\n' "$origin_url" | grep -Eq '^((git@|https://)github\.com[:/])kaye-dev/zoom-gov-contact-center-demo(\.git)?$' || {
    echo "Unexpected repository path; .env.local was not removed." >&2
    exit 1
  }

  env_file="${repo_root:?}/.env.local"
  [ -f "${env_file:?}" ] && [ ! -L "${env_file:?}" ] || {
    echo ".env.local is not a regular non-symlink file; it was not removed." >&2
    exit 1
  }

  oidc_key_count="$(awk '/^VERCEL_OIDC_TOKEN=/{count++} END{print count+0}' "${env_file:?}")"
  unexpected_line_count="$(awk '
    /^[[:space:]]*($|#)/ { next }
    /^VERCEL_OIDC_TOKEN=/ { next }
    { count++ }
    END { print count+0 }
  ' "${env_file:?}")"
  [ "$oidc_key_count" = 1 ] && [ "$unexpected_line_count" = 0 ] || {
    echo "Unexpected .env.local contents; it was not removed." >&2
    exit 1
  }

  echo "Confirmed key: VERCEL_OIDC_TOKEN"
  rm -- "${env_file:?}"
  [ ! -e "$env_file" ] && [ ! -L "$env_file" ]
)
```

Vercel Dashboardで、linkしたprojectを次の状態にします。

1. `Settings > Environment Variables`で[System Environment Variables](https://vercel.com/docs/environment-variables/system-environment-variables)の`Enable access to System Environment Variables`を有効にする。公式ドキュメントでは旧表示名`Automatically expose System Environment Variables`と記載されている。
2. `Settings > Functions`の[Fluid Compute](https://vercel.com/docs/fluid-compute)を`Enabled`にして保存する。
3. `Settings > Build and Deployment`でBuild Command、Output Directory、Root Directoryを上書きしない。Framework Presetが`Other`と表示されても変更せず、リポジトリの[`vercel.json`](../../../vercel.json)にある`"framework": "nextjs"`を使用する。
4. `Settings > Deployment Protection`でProtection levelを`None`にする。`Standard Protection`はstaged candidateの生成URLをVercel Authenticationへ302 redirectするため使用しない。`Protection Bypass for Automation`も作成しない。
5. `Settings > Git`の`Connected Git Repository` sectionにrepository名がなく、`This Project is not connected to a Git repository.`とGitHub／GitLab接続ボタンだけが表示されることを確認する。接続済みなら[Disconnect](https://vercel.com/docs/project-configuration/git-settings)する。
6. `Settings > Domains`で、設定エラーやredirectがなく`Production`と表示されるdomainを確認し、`https://...`形式のcanonical URLを控える。既存domainを追加する現行UIは`Add Existing`、新規購入は`Buy`である。初回デプロイ前の自動生成`*.vercel.app` domainには`No Deployment`と表示されてもよい。

### Edge Configを準備する

同じVercel Projectの`Storage > Create Database > Edge Config`で`zoom-gov-maintenance`を作成します。Itemsには次の3項目だけを保存し、初回はすべて無効にします。`updatedAt`は有効なUTC ISO日時にしてください。

```json
{
  "site_maintenance_production": { "version": 1, "mode": "DISABLED", "scheduledStartAt": null, "scheduledEndAt": null, "updatedAt": "2026-01-01T00:00:00.000Z" },
  "site_maintenance_preview": { "version": 1, "mode": "DISABLED", "scheduledStartAt": null, "scheduledEndAt": null, "updatedAt": "2026-01-01T00:00:00.000Z" },
  "site_maintenance_development": { "version": 1, "mode": "DISABLED", "scheduledStartAt": null, "scheduledEndAt": null, "updatedAt": "2026-01-01T00:00:00.000Z" }
}
```

Edge Configの`Tokens > Copy Connection String`からread-only connection stringを取得し、画面上部のEdge Config IDを控えます。さらに対象scopeへの書き込み権限を持つ[Vercel REST API access token](https://vercel.com/docs/rest-api#authentication)を作成します。connection stringと2種類のtokenは秘密情報です。ファイル、shell履歴、コマンド引数、ログ、チャットへ保存せず、後述の非表示プロンプトにだけ貼り付けます。

Project接続時に`EDGE_CONFIG`環境変数が自動作成された場合は、connection stringをpassword managerへ保存した後、その自動作成された環境変数だけを削除します。Edge Config store、Items、read tokenは削除しません。`deploy.sh`が`EDGE_CONFIG`を含むProduction限定の9項目を、レビュー後に正しい型で設定します。Team IDは入力値を信用せず、検証済みの`.vercel/project.json`の`orgId`を使用します。

## 3. Neon projectを準備する

[Neon Console](https://console.neon.tech/)で名前の横に`Free`と表示されるorganizationを選び、`New project`から`Create project`画面を開いて[projectを作成](https://neon.com/docs/manage/projects)します。

- Project name: `zoom-gov-contact-center-demo`
- Region: `Singapore`

project IDとproject nameを控え、CLIを認証します。

```bash
neon auth
```

Project Dashboardの`Connect`を開き、同じbranch・database・roleで[次の2つ](https://neon.com/docs/connect/connection-pooling)をコピーします。

- `Connection pooling`を有効にしたURL: `DATABASE_URL`。hostに`-pooler`が付く。
- `Connection pooling`を無効にしたURL: `DATABASE_URL_UNPOOLED`。hostに`-pooler`が付かない。

両方とも`sslmode=require`を含むことを確認します。URLは秘密情報のため、ファイルやチャットへ保存せず、後述の非表示プロンプトへだけ貼り付けます。
Connect画面の表示形式は`Connection string`を選び、`postgresql://`から始まるURL本体だけをコピーします。`DATABASE_URL=`、引用符、`psql`コマンドは含めず、hostnameの`.c-2.`などのproxy部分も編集しません。
NeonのVercel Integrationは使用しません。

## 4. デプロイする

対話可能なターミナルから直接実行します。pipeや`tee`は使用しません。

```bash
./deploy.sh
```

スクリプトはtest、lint、typecheck、audit、Production buildを自動実行します。表示された対象が想定と違う場合は承認せず、停止します。

表示順に、次を入力します。

1. 利用条件を確認し、`hobby`と入力する。
2. VercelのProduction URLを`https://...`で入力する。
3. Neonのproject ID、project nameを入力する。
4. Neon planをAPIで確認できない場合だけ、ConsoleでFreeであることを確認して`free`と入力する。
5. 非表示プロンプトへpooled URL、direct URLの順に貼り付ける。
6. 非表示プロンプトへEdge Configのread connection stringを貼り付け、Edge Config IDを入力し、続く非表示プロンプトへVercel REST API access tokenを貼り付ける。Team IDの入力はない。
7. Edge Configのowner、management/read接続、3項目の形式が検証されたことと、対象project・domain・DB host・Edge Config IDを確認し、環境変数更新へ`y`と入力する。設定値自体は表示されない。
8. 4件のmigration計画が表示されたら内容を確認し、計画作成へ`y`、実行直前に`migrate`と入力する。
9. 管理者作成へ`y`と入力し、emailに`admin@keien.dev`、任意のname、12〜128文字のpasswordを2回入力する。passwordはpassword managerへ保存し、変更内容を確認して作成へ`y`と入力する。
10. staged candidateのsmoke test後、5分間の無通信と、Neon管理APIのidle／active反映待ち（各最大約5分、合計最大約15分）の間はcandidate、Production URL、Neon SQL Editorへアクセスせずに待つ。candidate smokeは`site_maintenance_preview`の実効値に応じて公開HTMLの200または503を期待し、確認が完了したらpromotionへ`y`と入力する。promotion後は`site_maintenance_production`に対して同じ検証を行う。

認証やlinkの確認が表示された場合は、対象account／projectを確認してから`y`と入力します。
`docker compose exec web npm run db:seed-admin`とcompose既定の`admin@example.local`はローカルDB専用で、Neon Productionには反映されません。

`Canonical smoke passed`が表示されたら、canonical URLをブラウザで開き、次の最終確認を行います。

1. `/`が正常に表示され、内部リンクを操作できる。
2. `/login`から`admin@keien.dev`と保存したpasswordでログインできる。
3. `/docs/privacy-policy`と`/life/frequently-asked-questions`が表示される。
4. `/admin/users`で管理画面とユーザー一覧が表示される。
5. 管理画面の`ログアウト`を操作すると`/login`へ戻り、再び`/admin/users`を開いても未認証で保護される。
6. Vercelの`Settings > Domains`でcanonical domainの`No Deployment`が消え、`Production`として割り当てられている。

メンテナンスが有効な場合、`/`、`/docs/privacy-policy`、`/life/frequently-asked-questions`は503と`Cache-Control: no-store`を返すのが正常です。この場合も`/login`、管理API、static asset、raw Markdown、`/robots.txt`はメンテナンス503にならないことを`deploy.sh`が検証します。予定メンテナンスの有効時間内だけ、503に終了日時の`Retry-After`が付きます。

ここまで確認できればProductionの受入は完了です。

現行`deploy.sh`が扱えるmigrationは、リポジトリにある既存4件だけです。migrationを追加した場合は、デプロイスクリプトとテストを先に更新します。

## 停止した場合

自動rollbackは行われません。環境変数更新後にbuildが失敗した場合も、更新済みのVercel環境変数は戻りません。再実行する前に、最後に成功した工程と、VercelのProduction／candidate、Neon migrationの状態を確認してください。`DATABASE_URL_UNPOOLED`はVercelやファイルへ保存されません。
