# フォーク先でGitHub Actions Production deployを設定する

このrunbookは、フォークしたrepositoryで[`production-deploy.yml`](../../../.github/workflows/production-deploy.yml)を利用できる状態にするまでの入口です。上から順に進め、詳細な入力・権限・障害対応はリンク先を参照します。VercelのGit自動デプロイは使用せず、GitHub ActionsからProductionへ直接デプロイします。

## 対応範囲

この手順で新規に設定できるのは、Vercel / Neonの既存対象、AWS KMS / Parameter Store、AWS IAM / GitHub OIDC、GitHub Environmentです。現在のdeploy interfaceは、空のNeon databaseへのmigration bootstrapと最初の管理者作成を行いません。

新しい空DBから始める場合は、このrunbookを進める前にレビュー済みのbootstrap手順を別途用意してください。`prisma migrate deploy`、standalone SQL、`db:seed-admin`をProductionへ直接実行して迂回しません。現時点でサポートする開始点は、migration済みschemaとログイン可能な管理者が存在するVercel / Neon Productionです。詳しい初期状態は[既存Productionの初回設定と切替](initial-deploy.md#対応する初期状態)を参照してください。

## 0. 設定値を確認する

次の値をpassword managerまたは管理台帳で確認します。token、API key、passwordは表やissueへ転記しません。

| 値 | 取得元 |
| --- | --- |
| GitHub owner / repository | フォーク先repositoryのURL |
| AWS account ID / setup profile | AWS IAM Identity Center |
| Vercel team ID / project ID / project name | Vercel Dashboard |
| Canonical Production origin | VercelのProduction domain。例: `https://demo.example.com` |
| Neon project / branch / database / role | Neon Console |
| 管理者email / 現在のpassword | 既存Production |

GitHub CLIを利用できる場合は、フォーク先のowner / repositoryを確認できます。

```bash
gh repo view --json nameWithOwner --jq .nameWithOwner
```

## 1. フォークとproviderを準備する

1. repositoryをフォークし、default branchを`main`にする。
2. フォーク先のActionsを有効にし、[`production-deploy.yml`](../../../.github/workflows/production-deploy.yml)が`main`に存在することを確認する。
3. Vercel Hobby projectを作成または確認し、Git integrationを接続しない。canonical domain、ProductionのSensitive `BETTER_AUTH_SECRET`、Deployment Protection `None`を設定する。
4. Neon Free projectをSingapore（`aws-ap-southeast-1`）に用意し、primary read-write branch、database、roleを確認する。
5. Vercel tokenと、organization planまで参照できるNeon API keyを発行し、password managerへ保存する。
6. migration済みschemaと、後のcanonical smokeで使用する既存管理者があることを確認する。

provider側のexact allowlistと確認画面は[AWS Parameter Storeの初回設定](setup-deploy-aws.md#2-provider側を確認する)を参照してください。

## 2. AWS KMS / Parameter Storeを設定する

Dockerを起動し、対象AWS accountへ接続できるIAM Identity Center profileを用意します。setup identityには一時的にKMS / SSM書込権限が必要です。リポジトリルートで次を実行します。

```bash
./setup-deploy-aws.sh --profile <AWS_SETUP_PROFILE>
```

画面の指示に従ってVercel / Neon対象と3件の秘密値を登録します。setupは`ap-northeast-1`に専用KMS keyと次の4 parameterだけを作成します。

```text
/zoom-gov-contact-center-demo/production/deploy/config
/zoom-gov-contact-center-demo/production/deploy/vercel-token
/zoom-gov-contact-center-demo/production/deploy/neon-api-key
/zoom-gov-contact-center-demo/production/deploy/admin-password
```

repositoryを別名でフォークしても、workflowとscriptsが参照する上記path、KMS alias、Regionは自動では変わりません。変更する場合はworkflow、scripts、tests、IAM policy、docsを同時に変更してください。入力、再開、更新、rotationの詳細は[AWS Parameter Storeの初回設定](setup-deploy-aws.md)を参照します。

setup完了後は一時的な書込権限を外します。通常のlocal deployとActionsには、4件のexact `ssm:GetParameters`と3件の条件付き`kms:Decrypt`だけを許可します。

## 3. 最初のlocal Production deployを完了する

Actionsを有効化する前に、同じ設定でlocal deployとcanonical smokeが成功することを確認します。

```bash
./deploy.sh --profile <AWS_READ_ONLY_PROFILE>
```

初回のNeon role password rotation、メンテナンス、Production切替は[既存Productionの初回設定と切替](initial-deploy.md#4-メンテナンス中に初回切替を実行する)に従います。最後に`✓ PRODUCTION DEPLOYMENT SUCCEEDED`が表示され、管理者ログインとcanonical smokeが成功してから次へ進みます。

## 4. AWS IAM / GitHub OIDCを設定する

1. AWS accountにGitHub OIDC providerを作成する。URLは`https://token.actions.githubusercontent.com`、audienceは`sts.amazonaws.com`とする。
2. フォーク先repositoryのOIDC設定をread-only APIで確認する。

   ```bash
   gh api 'repos/{owner}/{repo}/actions/oidc/customization/sub'
   ```

3. responseの`use_default`が`true`であることを確認し、`sub_claim_prefix`へ次のsuffixを付けた2件をIAM Roleのtrust policyへ完全一致で設定する。

   ```text
   <sub_claim_prefix>:environment:production-deploy
   <sub_claim_prefix>:environment:production-migration
   ```

   新規forkでは`sub_claim_prefix`にimmutableなowner ID / repository IDが含まれる場合があります。元repositoryの`repo:kaye-dev/zoom-gov-contact-center-demo`をコピーしません。`use_default`が`false`の場合はcustom subjectを推測せず、[GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc)に従って完全一致値を作ります。

4. Actions専用IAM Roleを作成し、4 parameterへのread policyと専用KMS keyへの条件付きdecrypt policyを付与する。
5. Role ARNを控える。AWS access keyは作成しない。

trust policy、read policy、KMS key policyのJSONは[AWS IAM / GitHub OIDC設定](aws-iam-oidc.md)をそのまま使用し、`<AWS_ACCOUNT_ID>`、`<KMS_KEY_ID>`、`<OIDC_SUB_PREFIX>`だけをフォーク先の実値へ置き換えます。OIDCは長期AWS credentialをGitHubへ保存せず、jobごとに短期credentialを取得するために使用します。

## 5. GitHub EnvironmentとVariablesを設定する

repositoryの`Settings > Environments`に次の2件を作成します。名前はworkflowとOIDC subjectの一部なので変更しません。

| Environment | branch | reviewer | Secrets |
| --- | --- | --- | --- |
| `production-deploy` | `main`のみ | なし | なし |
| `production-migration` | `main`のみ | Production migrationを判断できる担当者 | なし |

GitHub Free / Pro / Teamでは、private repositoryのrequired reviewersにplan上の制約があります。フォーク先のvisibilityとGitHub planで利用できることを先に確認してください。利用できない場合は承認gateを無効化して迂回せず、repository visibilityまたはGitHub planを見直します。

`Settings > Secrets and variables > Actions > Variables`へ、非秘密値を2件登録します。

```text
AWS_ACCOUNT_ID=<12桁のAWS account ID>
AWS_PRODUCTION_DEPLOY_ROLE_ARN=arn:aws:iam::<AWS_ACCOUNT_ID>:role/<ACTIONS_ROLE_NAME>
```

GitHub Secretsは作成しません。Vercel token、Neon API key、管理者password、DB URL、AWS access keyはParameter Storeまたはproviderだけで管理します。

## 6. 保護設定と権限を検証する

1. `main`をbranch protectionまたはrulesetで保護し、Pull Request reviewと必須CIを設定する。`Plan artifact guard / Verify plan artifacts`をrequired status checkに登録し、`plans/template.md`以外のplan生成物をmergeできないようにする。
2. deploy関連ファイルの変更にCODEOWNERS reviewを設定する。
3. IAM Roleが2件のexact OIDC subject以外からAssumeRoleできないことを確認する。
4. Roleが4 parameterだけを読め、SSM経由の3件だけをdecryptできることを確認する。
5. GitHubのEnvironmentにSecretsがなく、repository Variablesが上記2件だけであることを確認する。

詳細な拒否テストとsecurity boundaryは[AWS IAM / GitHub OIDC設定](aws-iam-oidc.md#7-初回の権限テスト)を参照してください。AWSとGitHubは、OIDC trustを対象repositoryとEnvironmentへ限定し、Environmentへbranch protection ruleを設定することを推奨しています。[AWS IAM OIDC guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html)と[GitHub Environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)も参照してください。

## 7. GitHub Actionsからデプロイする

1. デプロイ対象を`main`へmergeし、必須CIの成功を確認する。
2. `Actions > Manual production deployment > Run workflow`を開く。
3. branchが`main`であることを確認して実行する。
4. pending migrationがある場合だけ、`production-migration`のplanとdigestを確認して承認する。
5. `Verify the canonical Production deployment`まで成功し、最後に`✓ PRODUCTION DEPLOYMENT SUCCEEDED`が表示されたことを確認する。

token、project ID、database URLの追加入力はありません。migrationがないrunは承認なしでProductionへ直接進みます。実行中のcredential境界、migration承認、完了判定、失敗時の扱いは[GitHub ActionsからProductionへ手動デプロイ](github-actions-redeploy.md)を参照してください。

## 完了チェック

- `main`の`Manual production deployment`を手動起動できる。
- 2 Environmentのbranch / reviewer設定が意図どおりである。
- IAM trust policyがフォーク先の実際の2 subjectだけを許可している。
- GitHubには秘密値と長期AWS credentialがない。
- canonical smokeまで成功し、対象commitとdeployment IDを確認できる。
