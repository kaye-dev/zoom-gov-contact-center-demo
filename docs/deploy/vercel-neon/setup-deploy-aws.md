# AWS Parameter Storeへデプロイ設定を保存・更新する

この手順は、ローカルの`./deploy.sh`とGitHub Actionsが共通利用するVercel / Neon設定をAWS Systems Manager Parameter Storeへ初回保存し、必要な項目だけを更新するrunbookです。設定後の通常デプロイではproject ID、connection string、token、管理者credentialを入力しません。

対象はVercel Hobby / Neon Freeを使う個人・非商用デモです。本番データや日本国内のデータ所在要件がある環境には使用しません。

## 保存構成

すべて`ap-northeast-1`へ保存します。

| Parameter                                                        | Type           | 内容                                                                                   |
| ---------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `/zoom-gov-contact-center-demo/production/deploy/config`         | `String`       | setup途中の進捗、または完了済みのversion付き対象・policy設定。秘密値とDB URLは含まない |
| `/zoom-gov-contact-center-demo/production/deploy/vercel-token`   | `SecureString` | Vercel API token                                                                       |
| `/zoom-gov-contact-center-demo/production/deploy/neon-api-key`   | `SecureString` | Neon API key                                                                           |
| `/zoom-gov-contact-center-demo/production/deploy/admin-password` | `SecureString` | Production管理者password                                                               |

3件の`SecureString`は専用のcustomer managed KMS key `alias/zoom-gov-contact-center-demo-production-deploy`を使います。Parameterはこの4件だけで、setup再開用のparameterを追加しません。

初回setupの途中では、`config`に検証済みの非秘密項目と各`SecureString`の予定versionを進捗として保存します。token、API key、passwordそのものは`config`へ保存しません。すべての入力とprovider検証が完了すると、同じ`config`を次の完了済みschemaで上書きします。`config`は手動編集しません。

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

AWS IAM Identity Center sessionが失効している場合、対話terminalで実行したlocal wrapperが再loginするか確認します。`y`または`yes`で承認すると、固定AWS CLI containerからdevice authorizationを開始し、login成功後に元のcommandを続行します。ホストへAWS CLIをインストールして次のcommandを事前実行する必要はありません。手動で更新する場合だけ、使用するprofileを明示します。

```bash
aws sso login --profile <AWS_PROFILE_NAME>
```

SSO session cacheは`~/.aws/sso/cache`にあり、tokenや一時credentialをリポジトリへコピーしません。[AWS CLIのIAM Identity Center認証](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)も参照してください。

local wrapperは通常処理で`~/.aws`をread-onlyでcontainerへmountします。AWS CLIがrole session用に必要とする`~/.aws/cli/cache`は、hostへcredentialを書き戻さない揮発性tmpfsで覆い、container終了時に破棄します。承認済みのSSO login中だけ、host userのUID / GIDでcontainerを実行し、token保存先である`~/.aws/sso/cache`を正確なnested mountとしてwrite可能にします。mountpointがない場合は、秘密値を含まない空ディレクトリをmode `0700`でhostに作成します。

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

リポジトリルートで実行します。profileが`.env`に保存されていない対話terminalでは、一覧から選択します。

```bash
./setup-deploy-aws.sh
```

profileを省略した場合は、`.env`の`DEPLOY_AWS_PROFILE`を使用します。それもない対話terminalでは利用可能なprofileから選択します。特定profileをその回だけ固定する場合は`--profile <AWS_PROFILE_NAME>`を使います。非対話実行でprofileを決定できない場合は停止します。

setupはprofile解決直後にSTS認証を確認し、SSO sessionの失効を検出すると再loginするか1回だけ確認します。承認した場合はdevice authorizationと再STS確認に成功してから、元のsetupを続行します。拒否、login失敗、再STS失敗ではdeploy runner imageをbuildせず停止します。非対話実行、SSO以外のprofile、AccessDeniedや通信障害ではlogin確認を出さず、認証エラーとして停止します。

setupは4件のparameterを確認し、次の3状態のいずれかとして開始します。

| 状態     | 起動後の動作                                                                              |
| -------- | ----------------------------------------------------------------------------------------- |
| 設定なし | 初期設定を開始することを表示し、AWS accountの書き込み確認後に先頭項目から入力する         |
| 設定途中 | 保存済みの設定状況を一覧表示し、AWS accountの書き込み確認後に最初の未完了項目から再開する |
| 設定完了 | 現在値を含む設定一覧を表示し、検証だけを行うか、更新する1項目を選択する                   |

設定途中の一覧では、非秘密項目は項目名、`保存済み` / `未設定`、保存済みの値を表示します。秘密項目は値を表示せず、`保存済み` / `未設定` / `再入力が必要`とSSM versionだけを表示します。`再入力が必要`は、予定versionを`config`へ保存済みですが、秘密値自体は保存されておらず、対応する`SecureString`への書き込みを完了するために再入力が必要な状態です。予定versionと実versionを照合してから書き込みを再開します。

```text
現在の設定状況:
  [保存済み] Vercel team ID: team_...
  [保存済み] Vercel project ID: prj_...
  [未設定] Canonical Production origin
  [保存済み] Vercel access token: 値は非表示 (SSM version 1)
  [再入力が必要] Neon API key: 値は非表示 (予定 SSM version 1)
  [未設定] Administrator password
```

一覧表示後も保存済み項目を再入力しません。最初の未完了項目から続行し、すべて揃うと同じ`config`を完了済みschemaへ更新します。

setupはSTSでAWS accountを確認し、表示された12桁accountが正しい場合だけ`setup <AWS_ACCOUNT_ID>`と入力して書き込みを許可します。確認を拒否した場合はparameterを変更せず停止します。設定完了時に`0`または空入力を選んだ場合は書き込みを行わないため、この確認を表示せず検証だけを行います。

承認後は次を順に入力します。各非秘密項目は形式検証に成功した時点で`config`の途中状態へ保存されます。Vercel tokenとNeon API keyは確認入力とprovider API検証に成功した時点、管理者passwordは確認入力に成功した時点で、対応する`SecureString`へ保存されます。

1. Vercel team ID (`team_...`)、project ID、project name、canonical Production origin。
2. Neon project ID、project name、primary branch ID、database name、role name。
3. 既存管理者のemail。
4. 非表示promptへVercel token、Neon API key、既存管理者passwordをそれぞれ2回入力する。

非秘密項目の形式エラーや秘密値の確認不一致では、入力済み項目へ戻らず、その項目だけを再入力します。canonical Production originのpromptは入力例を含む次の表示です。`https://`から始まるoriginを入力し、末尾の`/`は保存時に除かれます。

```text
Canonical Production origin (ex. https://demo.example.com):
```

provider APIエラー、AWS/KMS/SSMエラー、terminalのEOF・signal・中断は自動再試行しません。原因を解消して同じcommandを再実行すると、`config`の途中状態と`SecureString` versionを照合し、保存済み項目を飛ばして未完了項目から再開します。保存済みの非秘密項目を修正する必要がある場合は、同じcommandへ`--reconfigure`を追加し、維持する項目は空入力、新しい値が必要な項目だけを再入力します。version不一致、別KMS key、別accountなど途中状態の整合性を確認できない場合は、自動修復せず停止します。

専用symmetric single-Region KMS keyには365日rotation、管理tag、aliasを設定します。秘密値を書き込む直前に予定versionを`config`の途中状態へ記録し、対応する`SecureString`を更新します。すべて揃った後、それぞれの`PutParameter` versionを`config.secretVersions`に対応させた完了済み`config`を最後に書き込み、provider対象を再検証します。

途中状態のまま`./deploy.sh`を実行すると、未完了の`config`をデプロイ設定不足として扱い、同じprofileで`./setup-deploy-aws.sh`を再実行するよう案内して停止します。Vercel環境変数更新、DB migration、Production deployは開始しません。

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

setup完了後に引数なしで再実行すると、非秘密項目は現在値、秘密項目は値を伏せたSSM versionを添えたメニューを表示します。更新対象を1件だけ選択し、空入力または`0`は変更せず検証だけを行います。

```text
設定完了項目:
  1. Vercel team ID: <current value>
  2. Vercel project ID: <current value>
  3. Vercel project name: <current value>
  4. Canonical Production origin: <current value>
  5. Neon project ID: <current value>
  6. Neon project name: <current value>
  7. Neon branch ID: <current value>
  8. Neon database name: <current value>
  9. Neon role name: <current value>
  10. Administrator email: <current value>
  11. Vercel access token: 設定済み (SSM version <N>)
  12. Neon API key: 設定済み (SSM version <N>)
  13. Administrator password: 設定済み (SSM version <N>)

更新する設定番号を選択してください。
  0. 変更せず検証のみ
選択 [0]:
```

```bash
./setup-deploy-aws.sh --profile <AWS_PROFILE_NAME>
```

選択した1項目だけを入力し、完成形のVercel / Neon対象をAPIで検証してから保存します。入力形式が不正な場合や秘密値の確認が一致しない場合は、その項目だけを再入力します。別の項目も更新する場合は、完了後にもう一度実行して選択します。

更新対象をcommandで明示する従来の運用では、flagも利用できます。project、canonical origin、Neon branch / database / role、管理者emailなど秘密値以外をまとめて再入力する場合は`--reconfigure`を使います。

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

rotationは対象`SecureString`を新versionへ更新し、同じ操作で`config.secretVersions`との対応を更新します。途中で停止した場合は、次回setupで予定versionと実versionを照合して続行します。対応が判断できない場合はfail closedに停止します。通常deployで認証と対象一致を確認できるまで、旧credentialを無効化しません。

`--reconfigure`は既存の3秘密値を読み直して維持し、非秘密設定だけを再入力・API検証して`config`を更新します。`--rotate`は非秘密設定と他2秘密値を維持し、指定した1件だけを非表示promptから更新します。flag、メニューのどちらを使う場合も、書き込み前に`setup <AWS_ACCOUNT_ID>`の完全一致確認が必要です。メニューの`0`だけは検証のみで、値やversionを変更しません。

## 6. GitHub Actionsを設定する

ローカルsetupと同じ4 parameterをActionsから読む場合は、[フォーク先のGitHub Actions初回設定](github-actions-setup.md)を上から実施します。GitHubには長期AWS credentialやprovider secretsを保存せず、Environmentのexact OIDC subjectで許可したRoleから短期credentialを取得します。

## セキュリティ、料金、制約

- Standard parameterは追加料金なし、1 parameter最大4 KB、1 account / Regionあたり10,000件です。この用途は4件だけなのでStandardを使用します。[Parameter Store tier](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html)
- Standard throughputの既定上限は`GetParameter`、`GetParameters`、`GetParametersByPath`合計40 transaction/秒です。deployは4件を一括取得するため、通常この上限を引き上げません。[Parameter Store throughput](https://docs.aws.amazon.com/general/latest/gr/ssm.html)
- Advanced parameterは1件あたり月額0.05 USD、API interaction 10,000件あたり0.05 USDです。この用途ではAdvancedもhigher throughputも有効にしません。[Systems Manager pricing](https://aws.amazon.com/systems-manager/pricing/)
- customer managed KMS keyは1 keyあたり月額1 USDです。全Region合計で月20,000 requestのfree tierがあり、対称鍵の対象requestは超過10,000件あたり0.03 USDです。最初と2回目のrotation後はkey materialごとに月額1 USDが加算され、追加は2回目で上限になります。このsetupは365日rotationを有効にするため、実額は設定時点の[AWS KMS pricing](https://aws.amazon.com/kms/pricing/)で確認します。
- Parameter Storeには自動secret rotationがありません。定期自動rotationやmanaged secret lifecycleが必要なら[AWS Secrets Managerとの比較](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-about-examples.html)を再評価します。
- すべて`ap-northeast-1`に固定します。別Regionに同名parameterを作ってもdeployは読みません。
- `SecureString`の秘密値はcustomer managed keyで暗号化します。default AWS managed keyは、この用途のparameter単位の復号境界に使用しません。[SecureStringとKMS](https://docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html)

入力中断や一時的なAWS / provider APIエラーでsetupが停止した場合は、原因を解消して同じcommandを再実行します。保存済みの途中状態から安全に再開できない整合性エラーでは、KMS alias、4 parameterのtype / version、`config.secretVersions`を値なしで確認します。削除、parameterの手動上書き、keyの無効化を自動復旧として実行しません。
