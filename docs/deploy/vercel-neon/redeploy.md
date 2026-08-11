# Vercel / Neonへ再デプロイ

初回設定が完了している環境の2回目以降の手順です。初めての場合は[新規デプロイ](initial-deploy.md)を参照してください。

## 1. デプロイ対象を準備する

デプロイする変更をcommitし、Node.js 24でworktreeがcleanなことを確認します。

```bash
cd /Users/keien/dev/zoom/zoom-gov-contact-center-demo
git status --short
node --version
```

`git status --short`は何も表示されない状態にします。Vercelのlink先、Git未接続、System Environment Variables、Fluid Compute、Production domainに加え、Build Command、Output Directory、Root Directoryが未上書き、`Settings > Deployment Protection`が`None`のまま変わっていないことも確認します。Framework Presetが`Other`と表示されても、リポジトリの[`vercel.json`](../../../vercel.json)が`Next.js`を指定するため変更しません。`Protection Bypass for Automation`は作成しません。認証切れは`deploy.sh`が検出し、loginを実行する前に確認します。

`node --version`が`v24.x`でない場合は、HomebrewのNode.js 24を選択してから再確認します。

```bash
brew install node@24
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
hash -r
node --version
```

fresh cloneなどで`.vercel/project.json`がない場合は`vercel link`を実行し、新規作成せず既存projectへlinkします。

## 2. Neonの接続URLを用意する

Neon Project Dashboardの`Connect`を開き、同じbranch・database・roleで次の2つをコピーします。

- `Connection pooling`を有効にしたpooled URL
- `Connection pooling`を無効にしたdirect URL

pooled URLはhostに`-pooler`が付き、direct URLには付きません。両方とも`sslmode=require`を含むことを確認します。URLは毎回入力し、ファイルやVercelへdirect URLを保存しません。
Connect画面の表示形式は`Connection string`を選び、`postgresql://`から始まるURL本体だけをコピーします。`DATABASE_URL=`、引用符、`psql`コマンドは含めず、hostnameの`.c-2.`などのproxy部分も編集しません。

## 3. 再デプロイする

対話可能なターミナルから直接実行します。

```bash
./deploy.sh
```

スクリプトはtest、lint、typecheck、audit、Production buildを自動実行します。表示された対象が想定と違う場合は承認せず、停止します。

表示順に、次を入力します。

1. `hobby`、Production URL、Neon project ID／nameを入力する。
2. Neon planをAPIで確認できない場合だけ、ConsoleでFreeであることを確認して`free`と入力する。
3. 非表示プロンプトへpooled URL、direct URLの順に貼り付ける。
4. 対象を確認し、環境変数更新へ`y`と入力する。既存の`BETTER_AUTH_SECRET`は維持される。
5. migrationがup-to-dateならそのまま進む。pendingが表示された場合だけ、計画を確認して`y`、実行直前に`migrate`と入力する。
6. 通常は管理者作成・更新でEnterを押し、既存管理者のemailに`admin@keien.dev`、続けて保存したpasswordを入力する。管理者を更新する場合だけ`y`を選び、表示された変更内容を再確認する。
7. staged candidateのsmoke test後、5分間の無通信と、Neon管理APIのidle／active反映待ち（各最大約5分、合計最大約15分）の間はcandidate、Production URL、Neon SQL Editorへアクセスせずに待つ。確認が完了したら、promotionへ`y`と入力する。
`Canonical smoke passed`が表示されれば、Productionの再デプロイは完了です。

現行`deploy.sh`が扱えるmigrationは、リポジトリにある既存4件だけです。5件目以降を追加した場合は、デプロイスクリプトとテストを先に更新し、この手順では実行しません。

## 停止した場合

環境変数、candidate、migration、管理者更新、promotionは自動で元に戻りません。再実行前に最後に成功した工程を確認します。canonical受入失敗時にrollback確認が表示された場合も、DB migrationは戻らないため、表示されたprevious deployment IDと影響を確認してから判断してください。
