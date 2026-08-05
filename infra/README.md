# AWS CDK インフラ

自治体デモを低頻度で運用するための、東京リージョン固定・最小固定費構成です。

```text
CloudFront (OAC) -> Lambda Function URL (AWS_IAM)
                     -> Next.js Lambda (arm64)
                     -> Aurora PostgreSQL Serverless v2 (0-1 ACU)
```

VPC は 2 AZ の isolated subnet だけで構成し、NAT Gateway、VPC Endpoint、ALB、API Gateway、RDS Proxy、WAF は作りません。Aurora は接続がなくなってから 300 秒で 0 ACU へ自動停止します。

Lambda Function URL OACでは`POST` / `PUT`のunsigned payloadを受け付けないため、ブラウザの共通fetch helperが実送信bodyのSHA-256 hexを`x-amz-content-sha256`へ設定します。Better Authを含む全mutationで同じhelperを使い、CloudFrontの`AllViewerExceptHostHeader` origin request policyでこのheaderをoriginへ転送します。

## 月額の目安

東京リージョンの2026-08-05時点の公開単価を使った、低頻度デモ向け概算です。無料枠はAWS account／Organization内の他用途と共有されるため、0 USDを保証するものではありません。

| 項目 | 低頻度時の目安 | 根拠 |
| --- | ---: | --- |
| Aurora storage | 約1.20 USD/月から | 最小10 GB × 0.12 USD/GB-month |
| Secrets Manager | 約0.80 USD/月 | 2 secrets × 0.40 USD/secret-month |
| Aurora compute | 停止中0 USD、稼働分のみ | 0.15 USD/ACU-hour。0.5 ACUで5分なら理論値約0.00625 USD/回 |
| Lambda | 通常のデモ量なら0 USD想定 | 毎月100万request、400,000 GB-secondsの無料枠内を想定 |
| CloudFront | 通常のデモ量なら0 USD想定 | pay-as-you-go無料枠の毎月1 TB、1,000万request、Functions 200万invoke内を想定 |
| その他 | 数centからの従量 | Aurora I/O、CloudWatch Logs、CDK bootstrap S3 assetなど |

完全idleでもAurora storageと2 secretsが残るため、おおむね2–3 USD/月が下限です。例えば0.5 ACUで5分の起動が1日10回ならcomputeは約1.88 USD/月で、合計は概ね4 USD前後になります。実際はresume時間、query量、storage、共有無料枠、税・為替で変動します。[Aurora pricing](https://aws.amazon.com/rds/aurora/pricing/)、[Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/)、[Lambda pricing](https://aws.amazon.com/lambda/pricing/)、[CloudFront free tier](https://aws.amazon.com/cloudfront/faqs/)をデプロイ前に再確認してください。

月額10 USDのBudgetは50%・80%・100%で通知するだけで、resourceを停止するhard capではありません。使用しない期間の確実な節約方法は`npm run aws:destroy`で2 stackを削除することです。

## 入力

- `BUDGET_EMAIL`: 必須。月額 10 USD の 50%・80%・100%到達通知先
- `APP_ASSET_PATH`: 任意。Next.js Lambda zip。既定は `.aws-artifacts/web.zip`

Web zip のルートには実行権限付き `run.sh` と standalone Next.js の `server.js`、`.next`、`public` を配置します。Lambda Web Adapter arm64 layer v28 が `run.sh` をポート 3000 で起動します。

運用LambdaはPrisma CLIのmigration機能だけを使います。Prisma StudioのブラウザUIをassetから除外し、synth時に展開250 MiB未満であることを強制します。`DatabaseInstanceIdentifier` outputはdeploy後の0 ACU metric検証にだけ使用します。

```bash
BUDGET_EMAIL=operator@example.com npx cdk bootstrap aws://123456789012/ap-northeast-1 # 初回のみ
BUDGET_EMAIL=operator@example.com npx cdk synth
BUDGET_EMAIL=operator@example.com npx cdk deploy ZoomGovDemoDataStack
BUDGET_EMAIL=operator@example.com npx cdk deploy ZoomGovDemoWebStack
```

## Migration と seed

`ZoomGovDemoDataStack` の `OperationsFunctionName` outputが示す Lambda は、次のpayloadだけを受け付けます。

```json
{"action":"migration-status"}
{"action":"migration-deploy"}
{"action":"seed-admin","email":"admin@example.com","name":"Demo Admin","password":"..."}
```

`migration-deploy`は実行直前にもstatusを再検査し、未適用migrationだけを適用します。drift、失敗済みmigration、履歴不整合、接続エラーは自動修復せず`ok: false`で停止します。CDK deploy中にmigrationを自動適用するCustom Resourceはありません。

## Secretの扱い

DB資格情報とBetter Auth secretはSecrets Managerで生成します。isolated subnetから実行時に取得すると有料のInterface VPC Endpointが必要になるため、CloudFormation dynamic referenceでLambda環境設定へ解決します。Lambda実行roleには`secretsmanager:GetSecretValue`を付けません。secret更新時は両Lambdaを再デプロイしてください。

seed passwordはinvoke payloadからメモリ上でだけ利用し、Lambda環境変数やログへ保存しません。

## 検証

```bash
npx tsc -p infra/tsconfig.json --noEmit
node --import tsx --test infra/test/*.test.ts
BUDGET_EMAIL=operator@example.com npx cdk synth --quiet
```
