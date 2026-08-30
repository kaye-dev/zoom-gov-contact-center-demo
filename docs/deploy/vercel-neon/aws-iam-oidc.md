# AWS IAM / GitHub OIDC設定

この手順は、初回setup用profile、ローカルdeploy用profile、手動起動する[`production-deploy.yml`](../../../.github/workflows/production-deploy.yml)の権限境界を分離するための管理者設定です。VercelのGit自動デプロイへ切り替える手順ではありません。フォーク先を上から設定する場合は、先に[フォーク先のGitHub Actions初回設定](github-actions-setup.md)を参照してください。

このファイルにあるAWSとGitHubの操作はリポジトリへcommitされません。設定前に、AWS account、GitHub repository、IAM Role ARN、KMS key ARNが対象環境と一致することを別の管理者と確認してください。

## 前提

[AWS Parameter Storeの初回設定](setup-deploy-aws.md)が完了し、`ap-northeast-1`に次の4 parameterが存在する必要があります。

```text
/zoom-gov-contact-center-demo/production/deploy/config
/zoom-gov-contact-center-demo/production/deploy/vercel-token
/zoom-gov-contact-center-demo/production/deploy/neon-api-key
/zoom-gov-contact-center-demo/production/deploy/admin-password
```

`config`は`String`、残る3件は同じcustomer managed KMS keyを使う`SecureString`です。GitHubにはVercel token、Neon API key、管理者password、database URL、AWS access keyを保存しません。各jobがOIDCで短期AWS credentialを取得し、Parameter Storeを読み直します。秘密値とdatabase URLはjob output、artifact、cache、`GITHUB_ENV`へ渡しません。migration判定、plan digest、target fingerprint、新旧deployment IDだけを形式検証済みの非秘密値として後続jobへ渡します。

Actionsでは、commit archiveからdeploy runner imageをbuildし終えるまでOIDC Roleを取得しません。OIDC後にrepositoryのNode.js、npm、Vercel CLI、TypeScriptをhostで実行せず、host AWS CLIのSTS / exact `GetParameters`とDocker CLIだけを使います。AWS credential、OIDC request token、`~/.aws`、GitHub tokenをphase containerへ渡さず、復号済みSSM responseだけを成功marker付きstdinとして渡します。

## setup用profileとlocal deploy用profileを分離する

`./setup-deploy-aws.sh`に使う高権限profileは初回設定と明示した再設定・rotationだけに使用します。通常の`./deploy.sh`やGitHub Actionsには高権限のまま使いません。setup中に必要な権限は次の範囲です。

- `kms:CreateKey`だけは作成前にkey ARNを決定できないため`Resource: "*"`となる。専用の一時的なsetup identityへだけ許可し、初回完了後に外す。
- 作成済みkeyに対する`kms:DescribeKey`、`kms:ListResourceTags`、`kms:GetKeyRotationStatus`、`kms:EnableKeyRotation`、`kms:TagResource`は、確認済みの専用key ARNへ限定する。
- `kms:CreateAlias`は`arn:aws:kms:ap-northeast-1:<AWS_ACCOUNT_ID>:alias/zoom-gov-contact-center-demo-production-deploy`と、そのaliasが指す専用keyだけに限定する。`UpdateAlias`、`DeleteAlias`、`DisableKey`、`ScheduleKeyDeletion`は付与しない。
- `ssm:GetParameters`、`ssm:PutParameter`、`ssm:AddTagsToResource`は後述する4件のexact parameter ARNだけに限定する。metadata照合に使う`ssm:DescribeParameters`はresource-level制御非対応のため、setup identityだけに許可する。
- 3件のSecureStringに必要な`kms:Encrypt`、`kms:Decrypt`は専用keyへ限定し、KMS key policy側でもsetup identityを許可する。

setup完了後は、作成されたkey ARNとparameter ARNを確認して上記権限を縮小またはsetup identity自体を無効化します。再設定・rotation時だけ期限付きで戻し、操作後に再び外します。

ローカルの通常deploy用profileには、この文書の「Parameter Store/KMSのread policy」と同じpolicyだけを付与します。つまり4件のexact ARNへの`ssm:GetParameters`と、SSM経由・3件それぞれのexact `PARAMETER_ARN`に限定した`kms:Decrypt`だけです。KMS/SSMのlist、history、path read、write、delete権限は付与しません。`sts:GetCallerIdentity`によるaccount確認が通ることも確認します。ローカルprofileはIAM Identity Center等の短期sessionを使い、長期access keyを`.env`やDockerへ渡しません。

profile名を分ける場合はsetup終了時の`.env`保存を拒否し、最初の`./deploy.sh --profile <READ_ONLY_PROFILE>`で通常deploy用profileを保存します。同じprofile名を継続利用する場合は、先に一時的なsetup権限を外し、このread policyだけになったことを確認します。

## 1. GitHub OIDC providerをAWSへ登録する

対象AWS accountのIAMでOpenID Connect providerを1件作成します。

```text
Provider URL: https://token.actions.githubusercontent.com
Audience:     sts.amazonaws.com
```

同じproviderが対象accountに既に存在する場合は再作成せず、URLとaudienceを確認します。[AWSのOIDC Role作成手順](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html)と[GitHubのAWS OIDC手順](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)も参照してください。

## 2. exact subjectを確認する

GitHubのdefault subjectを使用するrepositoryでは、GitHub APIが返す`sub_claim_prefix`にEnvironment名を付けた2件が完全一致subjectです。

```text
<OIDC_SUB_PREFIX>:environment:production-deploy
<OIDC_SUB_PREFIX>:environment:production-migration
```

設定直前にrepository administratorが次のread-only APIで現在値を再確認します。

```bash
gh api 'repos/{owner}/{repo}/actions/oidc/customization/sub'
```

`use_default`が`true`であることを確認し、responseの`sub_claim_prefix`を`<OIDC_SUB_PREFIX>`として使用します。2026年7月15日以降に作成されたrepositoryやimmutable subjectを有効にしたrepositoryでは、prefixにowner IDとrepository IDが含まれます。元repositoryの名前固定prefixをフォーク先へコピーしません。

`use_default`が`false`の場合は、上記形式を使用しません。[GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc)とrepositoryのcustom subject設定に従い、2 Environmentが実際に発行するsubjectを完全一致で指定します。custom subjectを推測したり、部分一致や`*`へ緩和したりしません。

## 3. Actions専用IAM Roleを作成する

例として`ZoomGovProductionDeployActions`を作成し、Actions以外の利用者やEC2 service principalとは共有しません。trust policyでは、2 Environmentのexact subjectだけを許可します。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": [
            "<OIDC_SUB_PREFIX>:environment:production-deploy",
            "<OIDC_SUB_PREFIX>:environment:production-migration"
          ]
        }
      }
    }
  ]
}
```

`repo:*`、`<OIDC_SUB_PREFIX>:*`、任意branchやEnvironmentを許すwildcardは使用しません。Role maximum session durationは既定の1時間を維持します。

### Parameter Store/KMSのread policy

Roleには4 parameterの読取と、3 SecureStringをSSM経由で復号する権限だけを付与します。次の`<AWS_ACCOUNT_ID>`、`<KMS_KEY_ID>`を実値に置き換えます。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadExactDeployParameters",
      "Effect": "Allow",
      "Action": "ssm:GetParameters",
      "Resource": [
        "arn:aws:ssm:ap-northeast-1:<AWS_ACCOUNT_ID>:parameter/zoom-gov-contact-center-demo/production/deploy/config",
        "arn:aws:ssm:ap-northeast-1:<AWS_ACCOUNT_ID>:parameter/zoom-gov-contact-center-demo/production/deploy/vercel-token",
        "arn:aws:ssm:ap-northeast-1:<AWS_ACCOUNT_ID>:parameter/zoom-gov-contact-center-demo/production/deploy/neon-api-key",
        "arn:aws:ssm:ap-northeast-1:<AWS_ACCOUNT_ID>:parameter/zoom-gov-contact-center-demo/production/deploy/admin-password"
      ]
    },
    {
      "Sid": "DecryptVercelTokenThroughSsm",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:ap-northeast-1:<AWS_ACCOUNT_ID>:key/<KMS_KEY_ID>",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "ssm.ap-northeast-1.amazonaws.com",
          "kms:EncryptionContext:PARAMETER_ARN": "arn:aws:ssm:ap-northeast-1:<AWS_ACCOUNT_ID>:parameter/zoom-gov-contact-center-demo/production/deploy/vercel-token"
        }
      }
    },
    {
      "Sid": "DecryptNeonApiKeyThroughSsm",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:ap-northeast-1:<AWS_ACCOUNT_ID>:key/<KMS_KEY_ID>",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "ssm.ap-northeast-1.amazonaws.com",
          "kms:EncryptionContext:PARAMETER_ARN": "arn:aws:ssm:ap-northeast-1:<AWS_ACCOUNT_ID>:parameter/zoom-gov-contact-center-demo/production/deploy/neon-api-key"
        }
      }
    },
    {
      "Sid": "DecryptAdminPasswordThroughSsm",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:ap-northeast-1:<AWS_ACCOUNT_ID>:key/<KMS_KEY_ID>",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "ssm.ap-northeast-1.amazonaws.com",
          "kms:EncryptionContext:PARAMETER_ARN": "arn:aws:ssm:ap-northeast-1:<AWS_ACCOUNT_ID>:parameter/zoom-gov-contact-center-demo/production/deploy/admin-password"
        }
      }
    }
  ]
}
```

KMS key policy側もこのRoleへ上記条件付き`kms:Decrypt`を許可するか、account IAM policyによる権限委譲を有効にします。`config`は`String`なのでKMS復号権限の対象外です。KMS encryption contextにはprefix wildcardを使わず、3 SecureStringのparameter ARNを個別に完全一致させます。

`GetParametersByPath`、`GetParameterHistory`、list、write、deleteは付与しません。親pathへのrecursive権限は配下すべてを読めるため、子parameterのDenyを後付けしても安全な境界になりません。[GetParametersByPathの権限制約](https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-access.html)を参照してください。

## 4. GitHub Environmentを2つ作成する

repositoryの`Settings > Environments`に次の2件だけを作成します。Environment名はOIDC subjectに含まれるため、大文字小文字を含めて一致させ、作成後に変更しません。

### `production-deploy`

- Deployment branches and tags: `main`だけ
- Required reviewers: なし
- Secrets: なし

validate、migration plan、direct Production deploy、canonical smokeがこのEnvironmentを使います。workflow自身もmain以外のdispatchを最初のAWS OIDC取得前に停止します。

### `production-migration`

- Deployment branches and tags: `main`だけ
- Required reviewers: Production migrationを判断できる担当者
- Secrets: なし

pending migrationがあるrunだけ承認待ちになります。承認者は対象commit、migration一覧、plan digest、非破壊判定、schema driftの有無を確認します。一人運用で起動者自身が承認する必要がある期間は`Prevent self-review`を有効にしません。二人以上の運用体制になった時点で有効化を検討します。[Environmentのdeployment protection rules](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)も参照してください。

## 5. GitHub repository variablesを設定する

`Settings > Secrets and variables > Actions > Variables`へ、秘密でない次の2項目だけを登録します。

```text
AWS_ACCOUNT_ID
AWS_PRODUCTION_DEPLOY_ROLE_ARN
```

`AWS_PRODUCTION_DEPLOY_ROLE_ARN`には手順3で作成したRole ARNを設定します。`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`は登録しません。Vercel/Neon/DBの値もGitHub SecretsやVariablesへ複製しません。

## 6. Branchとworkflowを保護する

Environment subjectで許可されたmain上のworkflowはRoleを取得できます。最低限、次を設定してからProduction workflowを運用します。

- `main`への直接pushを禁止する。
- Pull Request reviewと必須CIを有効にする。
- `.github/workflows/**`、`deploy.sh`、`scripts/deploy/**`、deploy runner用Dockerfileの変更にCODEOWNERS reviewを要求する。
- fork由来のuntrusted codeをProduction Environmentで実行しない。
- 外部Actionをfull commit SHAへ固定する。
- workflow permissionは`contents: read`と`id-token: write`だけを基本にする。
- OIDC取得前の`git archive` / Docker buildと、取得後のhost AWS CLI / stdin転送の順序を変更するPRはsecurity reviewを必須にする。

## 7. 初回の権限テスト

Production deployの前に、temporary test workflowまたはAWS側のpolicy simulatorで次を確認します。parameterの値はlogへ表示しません。

1. Roleが2件のexact subjectからだけAssumeRoleできる。
2. 別Environment、別repository、main以外のrefではAssumeRoleできない。
3. 4 parameterへの`GetParameters`だけ成功する。
4. prefix外、history、path recursive、write、deleteが拒否される。
5. 3 SecureString以外のencryption contextや、SSM以外からの直接Decryptが拒否される。
6. Docker build中のnpm lifecycleにAWS / OIDC credentialがなく、build contextが`GITHUB_SHA`の`git archive`だけである。
7. phase containerのenvironment、argv、mount、Docker inspectにAWS credential、GitHub token、`~/.aws`がなく、SSM JSONがstdinだけで渡される。
8. workflow log、artifact、cache、raw result、job outputに秘密値とdatabase URLが残らず、許可した非秘密outputだけが転記される。

Parameter StoreとSTSのAPI callはCloudTrailの監査対象です。監査で必要なのはRole、GitHub run ID、parameter名、成否であり、値ではありません。[Parameter Storeの監査](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-logging-auditing.html)を参照してください。

## 8. Actions deployを実行する

設定後の実行と失敗時の扱いは[GitHub Actionsからの再デプロイ](github-actions-redeploy.md)を参照してください。EnvironmentやVariableを作成しただけではProductionへ変更は発生しません。
