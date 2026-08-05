# AWS運用スクリプト

東京リージョンの `ZoomGovDemoDataStack` / `ZoomGovDemoWebStack` を対象に、AWS identity確認、standalone asset生成、CDK deploy、Prisma migration preflight、warmup、smoke testを実行する。

## package.jsonに追加するscripts

```json
{
  "cdk": "cdk",
  "aws:deploy": "./scripts/aws/deploy.sh",
  "aws:warmup": "tsx scripts/aws/warmup.ts",
  "aws:verify-pause": "tsx scripts/aws/verify-pause.ts",
  "aws:seed-admin": "tsx scripts/aws/seed-admin.ts",
  "aws:destroy": "./scripts/aws/destroy.sh",
  "aws:test-scripts": "node --import tsx --test scripts/aws/test/*.test.ts",
  "audit:runtime": "npm audit --omit=dev",
  "test:infra": "node --import tsx --test infra/test/*.test.ts",
  "typecheck": "tsc --noEmit",
  "typecheck:infra": "tsc -p infra/tsconfig.json --noEmit"
}
```

## デプロイ

CDKをこのAWSアカウント・東京リージョンで初めて使う場合は、先に一度だけbootstrapする。既定のbootstrap stackは、asset用S3 bucket、空のECR repository、deploy用IAM roleを作成する。これらはアプリの2 stackとは別の共有基盤なので、`aws:destroy`では自動削除しない。

```bash
AWS_PROFILE=demo \
BUDGET_EMAIL=alerts@example.com \
npx cdk bootstrap aws://123456789012/ap-northeast-1
```

bootstrap先のaccount IDは、実行前に`aws sts get-caller-identity --profile demo`で確認する。

```bash
AWS_PROFILE=demo \
AWS_EXPECTED_ACCOUNT_ID=123456789012 \
BUDGET_EMAIL=alerts@example.com \
npm run aws:deploy
```

`AWS_EXPECTED_ACCOUNT_ID`は任意だが、誤ったAWSアカウントへのdeployを防ぐため設定を推奨する。リージョンの既定値は`ap-northeast-1`。`BUDGET_EMAIL`は必須。

処理順は次のとおり。

1. AWS account、principal、regionを表示し、対象を対話確認する。
2. アプリ／運用スクリプト／CDKのtest、lint、型検査、runtime依存監査、Next.js standalone build、CDK synth/diffを実行する。
3. 表示したCDK diff（replacement／deletionを含む）を確認し、再承認された場合だけDataStackをdeployする。
4. operations Lambdaで`migration-status`を実行する。
5. statusが`pending`の場合だけ`[y/N]`を表示し、承認後に`migration-deploy`を実行する。
6. statusがdrift、接続失敗、または未知の結果ならWebStackのdeploy前に停止する。
7. WebStackをdeployし、`/api/health`、OAC署名対象のPOST、`/`、`/login`、直Function URLの403を確認する。
8. smoke後はDBへ接続せず、最大10分待ってCloudWatchの`ServerlessDatabaseCapacity`が0 ACUになったことを確認する。

DataStack作成後にmigration拒否・接続障害・WebStack失敗などで停止した場合、Auroraとsecretsは残る。修正して再実行しない場合は、表示される警告に従って`npm run aws:destroy`で削除する。

生成assetの既定パスは`.aws-artifacts/web.zip`。変更する場合はCDKと同じ`APP_ASSET_PATH`を指定する。assetはDocker/Colimaの`node:24-bookworm-slim`を`linux/arm64`で起動して生成するため、host側のmacOS `node_modules`は同梱しない。

## 初期管理者

```bash
AWS_PROFILE=demo npm run aws:seed-admin -- \
  --email admin@example.com \
  --name "Demo Admin"
```

最初にSTS identityとregionを表示し、`AWS_EXPECTED_ACCOUNT_ID`が指定されていればaccountを照合する。対象accountの明示確認後にだけpassword入力へ進む。passwordはTTYで2回、非表示入力する。`--password`、環境変数、CDK contextからの受け渡しには対応しない。Lambda invoke payloadはmode `0600`の一時ファイルにだけ書き込み、invoke完了後に削除する。

seed後はpasswordをログへ出さずにCloudFront経由でsign-inし、admin session、admin API、admin pageを確認する。さらに一時的な検証userを作成してBetter Auth admin APIで削除し、create/delete mutationも確認してからsign-outする。途中失敗時も検証user削除とsign-outをbest effortで実行する。

## Warmupと削除

```bash
AWS_PROFILE=demo npm run aws:warmup
AWS_PROFILE=demo npm run aws:verify-pause
AWS_PROFILE=demo npm run aws:destroy
```

warmupはCloudFormationの`ApplicationUrl`を取得して`/api/health`を最大3回呼ぶ。deploy後のsmokeはGETに加え、bodyのSHA-256を`x-amz-content-sha256`へ設定したDB非接続・非更新POSTを`/api/oac-payload-probe`へ送り、CloudFront OACがLambda Function URL向けに署名できることを検証し、直Function URLは403であることも確認する。`aws:verify-pause`は6分待ってから最大5回metricを確認し、10分以内に0 ACUを観測できなければ失敗する。

ローカルDB確認用の`POST /api/demo-records`はproductionではDBへ接続せず404にする。公開のpassword reset申請は同一emailの15分重複排除、5分20件の全体上限、総行数1,000件、30日保持でDB書き込み量を制限する。これらはDDoS防御や支出のhard capではないため、デモを長期間使わない場合はstackを削除する。

destroyはAWS identityを再表示し、`destroy`の完全入力後にWebStack、DataStackの順で削除する。削除前にDB clusterと2 secretsのphysical IDを保存し、削除後にcluster、snapshot、secretsが残っていないことを確認する。CDK bootstrap bucketは他のCDK appと共有される可能性があるため、object件数だけを表示して自動削除しない。
