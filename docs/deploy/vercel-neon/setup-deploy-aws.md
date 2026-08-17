# AWS Parameter Storeへデプロイ設定を初回保存する

この手順は、ローカルの`./deploy.sh`とGitHub Actionsが共通利用するVercel / Neon設定をAWS Systems Manager Parameter Storeへ保存する一回限りのrunbookです。設定後の通常デプロイではproject ID、connection string、token、管理者credentialを入力しません。

対象はVercel Hobby / Neon Freeを使う個人・非商用デモです。本番データや日本国内のデータ所在要件がある環境には使用しません。

## 保存構成

すべて`ap-northeast-1`へ保存します。

| Parameter | Type | 内容 |
| --- | --- | --- |
| `/zoom-gov-contact-center-demo/production/deploy/config` | `String` | version付きの対象・policy設定。秘密値とDB URLは含まない |
| `/zoom-gov-contact-center-demo/production/deploy/vercel-token` | `SecureString` | Vercel API token |
| `/zoom-gov-contact-center-demo/production/deploy/neon-api-key` | `SecureString` | Neon API key |
| `/zoom-gov-contact-center-demo/production/deploy/admin-password` | `SecureString` | Production管理者password |

3件の`SecureString`は専用のcustomer managed KMS key `alias/zoom-gov-contact-center-demo-production-deploy`を使います。`config`は次のversion付きschemaで、手動編集しません。

```text
schemaVersion, policyVersion
aws.accountId, aws.region
vercel.orgId (Vercel team ID), projectId, projectName, canonicalOrigin, expectedPlan
neon.projectId, projectName, branchId, databaseName, roleName, regionId, expectedPlan
admin.email
kmsKeyArn
secretVersions.vercelToken, neonApiKey, adminPassword
```

Neonのpooled / direct connection stringは保存しません。deployの各phaseがNeon APIから対象branch / database / roleの値を取得し、host、pooling、TLS、project対応を検証してprocess内だけで使用します。

## 1. 前提を準備する

- Docker EngineまたはDocker Desktopが起動している。
- 対象AWS accountのIAM Identity Center profileが`~/.aws/config`にある。
- profileで対象accountへloginでき、`ap-northeast-1`のKMS key / aliasと上記4 parameterを作成・更新・検証できる。
- Vercel project、Production domain、ProductionのSensitive `BETTER_AUTH_SECRET`、Neon project / primary read-write branch / database / roleが作成済みである。
- Vercel token、Neon API key、管理者passwordをpassword managerから取得できる。

Node.js、npm、Vercel CLI、Neon CLIをhostへインストールする必要はありません。deploy runner image内の固定versionを使います。

AWS IAM Identity Center sessionが失効している場合は、ブラウザまたはdevice authorizationで再loginします。SSO session cacheは`~/.aws/sso/cache`にあり、tokenや一時credentialをリポジトリへコピーしません。[AWS CLIのIAM Identity Center認証](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)も参照してください。

local wrapperは`~/.aws`をread-onlyでcontainerへmountします。AWS CLIがrole session用に必要とする`~/.aws/cli/cache`だけは、hostへcredentialを書き戻さない揮発性tmpfsで覆い、container終了時に破棄します。mountpointがない場合は、秘密値を含まない空ディレクトリをmode `0700`でhostに作成します。

初回setup用identityには、少なくとも次のAPIを対象account / Regionで許可します。`CreateKey`は作成前にkey ARNを限定できないため、初回だけ使う管理者identityへ分離し、setup完了後の通常deploy identityには付与しません。

```text
sts:GetCallerIdentity
kms:CreateKey, kms:TagResource, kms:DescribeKey, kms:ListResourceTags
kms:GetKeyRotationStatus, kms:EnableKeyRotation, kms:CreateAlias
kms:Encrypt, kms:Decrypt
ssm:GetParameters, ssm:DescribeParameters, ssm:PutParameter
ssm:AddTagsToResource
```

組織のSCP、permission boundary、KMS key policyも同じ操作を許可する必要があります。通常deploy用identityは[AWS IAM / OIDC設定](aws-iam-oidc.md)にある4件のreadと3件のexact decryptへ縮小します。

## 2. provider側を確認する

### Vercel

1. 個人のHobby scopeと対象projectを確認する。
2. canonical domainがProductionへ割り当てられ、HTTPSで到達できることを確認する。
3. `Settings > Git`でGit repositoryが接続されていないことを確認する。接続済みならこのprojectだけをDisconnectする。
4. `Settings > Environment Variables`でProduction対象の不要なproject変数とShared Environment Variableがないことを確認する。
5. password managerで十分な長さのrandomな`BETTER_AUTH_SECRET`を一度だけ生成し、DashboardからProduction対象のSensitive値として設定する。Shared Environment Variableにはしない。
6. `Settings > Deployment Protection`を`None`にする。
7. project / environment / deploymentの検証と更新に必要なVercel tokenを発行する。

Vercel tokenをGitHub Secrets、`.env`、shell変数へ複製しません。初回setupの非表示入力へだけ渡します。[Vercel token](https://vercel.com/docs/accounts/create-a-token)と[Git設定](https://vercel.com/docs/project-configuration/git-settings)も参照してください。

### Neon

1. `Free` planのorganizationと対象projectを確認する。
2. regionが`aws-ap-southeast-1`（Singapore）であることを確認する。
3. primary read-write branch、database、roleを確認する。read replicaは使用しない。
4. project / branch / endpoint / connection URIに加え、organization detailsとplanをreadできるNeon API keyを発行する。project-scoped keyだけではorganizationのplan検証に必要な権限が不足する場合があるため、実際にorganization APIをreadできるkeyを使用する。

connection stringを事前にコピーする必要はありません。setupとdeployがAPIから取得します。NeonのVercel Integrationは使用しません。[Neon API key](https://neon.com/docs/manage/api-keys)も参照してください。

`setup-deploy-aws.sh`が変更するAWS resourceは専用KMS key / aliasと上記4 parameterだけです。Vercel / Neonのproject、domain、branch、database、role、`BETTER_AUTH_SECRET`、管理者userは作成しません。provider Dashboardで準備した既存resourceをAPIで選択・検証して保存します。

## 3. 初回setupを実行する

リポジトリルートで、利用するAWS profileを明示して実行します。

```bash
./setup-deploy-aws.sh --profile <AWS_PROFILE_NAME>
```

profileを省略した場合は、`.env`の`DEPLOY_AWS_PROFILE`を使用します。それもない対話terminalでは利用可能なprofileから選択します。非対話実行でprofileを決定できない場合は停止します。

setupはAWS accountを確認し、provider APIでplan、project、domain、region、branch、database、roleを検証した後、保存内容の要約を表示します。Vercel token、Neon API key、管理者passwordは非表示で入力し、値をlog、argv、temporary fileへ出しません。対象とpolicyの確認を拒否した場合はparameterを変更せず停止します。

初回だけ次を入力します。これはSSMへ登録する一回限りの入力で、通常deployでは再入力しません。

1. Vercel team ID (`team_...`)、project ID、project name、canonical Production origin。
2. Neon project ID、project name、primary branch ID、database name、role name。
3. 既存管理者のemail。
4. 非表示promptへVercel token、Neon API key、既存管理者passwordを入力し、passwordをもう一度入力する。
5. API検証後、表示された12桁accountが正しい場合だけ`setup <AWS_ACCOUNT_ID>`と入力する。

最後の完全一致確認より前はAWS resourceを書き込みません。承認後、専用symmetric single-Region KMS keyを作成し、365日rotation、管理tag、aliasを設定します。そのkeyで3 SecureStringを作成し、それぞれの`PutParameter`が返したversionを`config.secretVersions`に対応させた`config`を最後に書き込み、provider対象を保存後に再検証します。4件を`GetParameters`で再取得する処理ではありません。

実行後はparameter名、type、KMS key ARN、versionだけを確認します。値を表示する`--with-decryption`や`GetParameter`を手動確認へ使いません。

setup成功後に`.env`が存在しない場合だけ、選択したprofileをローカル既定値として保存するか確認されます。承認するとtrackedの[`.env.example`](../../../.env.example)を複製し、`DEPLOY_AWS_PROFILE`だけを選択値へ置換して、同じdirectory内のtemporary fileからatomicに`.env`へ配置します。permissionは`0600`です。

```dotenv
DEPLOY_AWS_PROFILE=<AWS_PROFILE_NAME>
```

保存を拒否してもsetup結果は維持され、以後`--profile`を指定できます。既存の`.env`がある場合はpromptも変更も行いません。`.env`がないまま`./deploy.sh --profile ...`を実行した場合は、SSM設定の検証成功後に同じ保存確認がもう一度表示されます。

setup専用profileと通常deploy用のread-only profileを分ける場合は、setup直後の保存を拒否し、最初の`./deploy.sh --profile <READ_ONLY_PROFILE>`でread-only profileを保存します。同じprofileを使う場合は、KMS / SSM書込権限を外してread-onlyへ縮小したことを確認してから通常deployへ進みます。setup権限が残ったprofileを通常deployの既定値にしません。

`.env`はdeploy containerへfileとしてmount / sourceされず、wrapperが`DEPLOY_AWS_PROFILE`だけを厳格に読み取ります。Productionのtoken、API key、管理者password、DB URLを`.env`へ保存しません。`.env.example`由来の既存ローカル開発設定はそのまま維持し、profileを手動で追記・置換することを通常手順にはしません。

## 4. 通常デプロイを確認する

worktreeをcleanにし、同時deployがない状態で実行します。

```bash
./deploy.sh --profile <AWS_PROFILE_NAME>
```

profileを`.env`へ設定した場合は次だけで構いません。

```bash
./deploy.sh
```

migrationがup-to-dateなら入力なしで、target検証、品質検査、direct Production deploy、canonical smokeまで進みます。pending migrationがある場合だけ適用前に1回承認します。詳しくは[ローカルからの再デプロイ](redeploy.md)を参照してください。

## 5. 設定変更とrotation

project、canonical origin、Neon branch / database / role、管理者emailなど秘密値以外の対象設定を変更する場合は、全対象をAPIで再検証してから`config`を更新します。

```bash
./setup-deploy-aws.sh --profile <AWS_PROFILE_NAME> --reconfigure
```

秘密値は1件ずつrotateします。新しい値をcommand引数へ付けず、非表示promptへ入力します。

```bash
./setup-deploy-aws.sh --profile <AWS_PROFILE_NAME> --rotate vercel-token
./setup-deploy-aws.sh --profile <AWS_PROFILE_NAME> --rotate neon-api-key
./setup-deploy-aws.sh --profile <AWS_PROFILE_NAME> --rotate admin-password
```

`admin-password`は既存管理者でcanonical smokeへログインするための保存値だけを更新します。管理者userや認証DBはsetup/deployから変更しないため、先にレビュー済みの管理画面操作で同じ既存管理者のpasswordを変更し、その新しい値をこの非表示promptへ入力します。

rotationは対象SecureStringを新versionへ更新し、同じ操作で`config.secretVersions`との対応を更新します。途中失敗時はversion対応を検査してfail closedに停止します。通常deployで認証と対象一致を確認できるまで、旧credentialを無効化しません。

`--reconfigure`は既存の3秘密値を読み直して維持し、非秘密設定だけを再入力・API検証して`config`を更新します。`--rotate`は非秘密設定と他2秘密値を維持し、指定した1件だけを非表示promptから更新します。どちらも書込前に`setup <AWS_ACCOUNT_ID>`の完全一致確認が必要です。flagなしで4 parameterが揃っている場合は検証だけを行い、値やversionを変更しません。

## 6. GitHub Actionsを設定する

ローカルsetupと同じ4 parameterをActionsから読む場合は、[GitHub Actions用AWS IAM / OIDC設定](aws-iam-oidc.md)に従います。GitHubには長期AWS credentialやprovider secretsを保存せず、Environmentのexact OIDC subjectで許可したRoleから短期credentialを取得します。

## セキュリティ、料金、制約

- Standard parameterは追加料金なし、1 parameter最大4 KB、1 account / Regionあたり10,000件です。この用途は4件だけなのでStandardを使用します。[Parameter Store tier](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html)
- Standard throughputの既定上限は`GetParameter`、`GetParameters`、`GetParametersByPath`合計40 transaction/秒です。deployは4件を一括取得するため、通常この上限を引き上げません。[Parameter Store throughput](https://docs.aws.amazon.com/general/latest/gr/ssm.html)
- Advanced parameterは1件あたり月額0.05 USD、API interaction 10,000件あたり0.05 USDです。この用途ではAdvancedもhigher throughputも有効にしません。[Systems Manager pricing](https://aws.amazon.com/systems-manager/pricing/)
- customer managed KMS keyは1 keyあたり月額1 USDです。全Region合計で月20,000 requestのfree tierがあり、対称鍵の対象requestは超過10,000件あたり0.03 USDです。最初と2回目のrotation後はkey materialごとに月額1 USDが加算され、追加は2回目で上限になります。このsetupは365日rotationを有効にするため、実額は設定時点の[AWS KMS pricing](https://aws.amazon.com/kms/pricing/)で確認します。
- Parameter Storeには自動secret rotationがありません。定期自動rotationやmanaged secret lifecycleが必要なら[AWS Secrets Managerとの比較](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-about-examples.html)を再評価します。
- すべて`ap-northeast-1`に固定します。別Regionに同名parameterを作ってもdeployは読みません。
- `SecureString`の秘密値はcustomer managed keyで暗号化します。default AWS managed keyは、この用途のparameter単位の復号境界に使用しません。[SecureStringとKMS](https://docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html)

setupが停止した場合は、同じcommandを重ねて実行する前にKMS alias、4 parameterのtype / version、`config.secretVersions`を値なしで確認します。削除やkeyの無効化を自動復旧として実行しません。
