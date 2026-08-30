# 既存Vercel / Neon Productionを簡素化デプロイへ移行する

この手順は、既存のVercel Hobby / Neon Freeデモ環境をAWS Parameter Storeに登録し、以後`./deploy.sh`だけで再デプロイできるようにする初回runbookです。Node.js、Vercel CLI、Neon CLI、connection stringの毎回入力は不要になります。

対象は個人・非商用デモで、本番データや日本国内のデータ所在要件がない環境に限ります。2回目以降は[ローカルからの再デプロイ](redeploy.md)を参照してください。

## 対応する初期状態

このsimplified pathは、すでに稼働しているProductionの継続運用を対象にします。次が存在する必要があります。

- Git integrationを切断したVercel Hobby projectとcanonical Production domain
- Productionだけを対象にした既存Sensitive `BETTER_AUTH_SECRET`
- Singapore（`aws-ap-southeast-1`）のNeon Free project、primary read-write branch、database、role
- migration済みschema
- `config.admin.email`として登録する既存admin userと、その現在のpassword

empty databaseからの初回admin bootstrapは今回の公開interfaceに含みません。setupもdeployもadmin userを自動作成しません。既存adminがない環境では本手順を開始せず、別途レビューされたbootstrap設計を先に用意してください。standalone SQL、seed、migrationコマンドで迂回しません。

## 1. provider側を確認する

### Vercel

対象projectのDashboardで次を確認します。

1. scopeが個人の`Hobby`である。
2. `Settings > Git`の`Connected Git Repository`にrepositoryがなく、GitHub / GitLab接続ボタンだけが表示される。接続済みならこのprojectだけをDisconnectする。
3. `Settings > Domains`でcanonical domainが`Production`に割り当てられ、redirect / configuration errorがない。
4. `Settings > Deployment Protection`が`None`である。
5. Build Command、Output Directory、Root Directoryを上書きしていない。frameworkはリポジトリの[`vercel.json`](../../../vercel.json)を使う。
6. `Settings > Environment Variables`にProduction対象のSensitive `BETTER_AUTH_SECRET`が1件ある。値を読み出し、再入力、Parameter Storeへ複製しない。
7. Production対象の変数名が`DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`BETTER_AUTH_TRUSTED_ORIGINS`、`BETTER_AUTH_TRUST_PROXY_HEADERS`、`APP_CANONICAL_ORIGIN`以外にない。
8. `Shared`のProduction対象変数がこのprojectへlinkされていない。

`BETTER_AUTH_SECRET`がない既存projectでは、password managerで十分な長さのrandom値を一度だけ生成し、Dashboardの非公開入力からProduction対象のSensitive値として設定します。shell、chat、`.env`、GitHub、Parameter Storeへ値を出しません。deployは存在とSensitive typeだけを検証し、値を読み取り、生成、更新しません。

Vercel Dashboardから対象projectを検証・更新できるtokenを発行し、password managerへ保存します。tokenは後のsetupで非表示入力へだけ渡します。[Vercel token](https://vercel.com/docs/accounts/create-a-token)と[Git接続の設定](https://vercel.com/docs/project-configuration/git-settings)も参照してください。

### Neon

Neon Consoleで次を確認します。

1. organizationのplanが`Free`である。
2. project regionが`Singapore`（`aws-ap-southeast-1`）である。
3. 対象branchがprimary read-write branchである。read replicaは使用しない。
4. 既存admin userを含む対象databaseとroleがある。
5. project / branch / endpoint / connection URIに加え、organization detailsとplanをreadできるNeon API keyを発行し、password managerへ保存する。project-scoped keyだけではorganization planの検証権限が不足する場合がある。

pooled / direct connection stringはコピーしません。deployの各phaseがNeon APIから取得し、同じproject / branch / database / role、pooling、TLSを検証します。NeonのVercel Integrationは使用しません。[Neon API key](https://neon.com/docs/manage/api-keys)も参照してください。

## 2. ローカル環境を準備する

repository checkoutに使うGitとshellを除き、デプロイ用に追加するhost toolはDockerだけです。Docker EngineまたはDocker Desktopを起動します。Node.js、npm、Vercel CLI、Neon CLIをhostへインストールしません。

対象AWS accountへ接続するIAM Identity Center profileを`~/.aws/config`へ用意し、sessionが失効している場合は再loginします。初回setupを行うprofileには、専用KMS key / aliasと4件のParameter Storeを作成・検証する権限が必要です。通常deployとGitHub Actionsはread-only権限に分離します。

## 3. AWS Parameter Storeへ初回保存する

デプロイ対象をcommitしてworktreeをcleanにし、リポジトリルートから実行します。

```bash
cd /Users/keien/dev/zoom/zoom-gov-contact-center-demo
git status --short
./setup-deploy-aws.sh
```

`.env`にprofileがない場合は対話一覧から選択します。選択したprofileのSSO sessionが失効している場合は、wrapperが再loginするか確認します。承認すると固定AWS CLI containerのdevice authorizationを開始し、loginとSTS再確認に成功した時点から元のcommandを続行します。特定profileをその回だけ固定する場合だけ`--profile <AWS_PROFILE_NAME>`を追加します。非対話実行ではlogin確認を表示せず停止します。

parameterがない場合、setupは初期設定を開始することを表示します。AWS accountへの書き込みを完全一致で承認した後、Vercel / Neonの既存project、plan、domain、branch、database、roleを項目ごとに入力・検証します。検証済みの非秘密項目は同じ`config`へ途中保存し、Vercel token、Neon API key、既存admin passwordは確認できたものから専用KMS keyの`SecureString`へ保存します。秘密値は`config`へ保存しません。

入力形式や秘密値の確認不一致では、その項目だけを再入力します。provider API、AWS、terminal中断などで停止した場合は自動再試行しません。原因を解消して同じcommandを再実行すると、非秘密値は保存済みの値、秘密値は値を伏せた状態とSSM versionを一覧表示し、未完了項目から再開します。Parameter Storeは途中状態を含めて4 parameterだけを使用します。

Vercel / Neon resource、domain、`BETTER_AUTH_SECRET`、admin userは作成しません。対象が一致しない、provider policyを確認できない、既存parameterと衝突する場合は変更せず停止します。入力とrotationの詳細は[AWS Parameter Storeの初回設定](setup-deploy-aws.md)を参照してください。

`config`が途中状態の間は`./deploy.sh`を実行できません。deployはsetupの再実行を案内し、Vercel環境変数更新、DB migration、Production deployを開始せず停止します。setupの完了メッセージを確認してから初回切替へ進みます。

setup成功後、`.env`がまだない場合だけ、このprofileをローカル既定値として保存するか確認されます。保存を選ぶと`.env.example`から作成した`.env`の`DEPLOY_AWS_PROFILE`だけが置換され、permissionは`0600`になります。拒否してもsetupは成功したまま終了し、以後`--profile`を指定できます。

## 4. メンテナンス中に初回切替を実行する

既存の固定connection stringからNeon APIの動的connection URIへ切り替える初回だけは、planned maintenanceとして続けて実施します。

1. 現行Productionの管理画面で`PRODUCTION`をメンテナンス`ENABLED`にし、canonical公開HTMLが503と`Cache-Control: no-store`を返すことを確認する。
2. Neon Consoleで対象project、primary branch、database、roleを再確認する。
3. 対象roleのpasswordをNeon Consoleからrotateする。新しいpasswordやconnection stringをコピーしてファイル、shell、chatへ保存しない。
4. 古いVercel Productionのconnection stringは失効するため、公開HTMLがfail closedの503を維持することを確認する。
5. `.env`へprofileを保存した場合は`./deploy.sh`、保存しなかった場合は同じ`--profile`を付けて実行する。

```bash
./deploy.sh --profile <AWS_PROFILE_NAME>
```

runnerはDocker内の固定Node / Vercel CLIを使い、Parameter StoreとNeon APIから対象情報を再取得します。role passwordのrotate後は、同じbranch / database / roleのpooled URIとdirect URIをAPIから動的に取得します。direct URIはmigration / DB検証のprocess内だけ、pooled URIはVercel Productionの`DATABASE_URL`同期に使います。いずれもSSM、local file、job outputへ保存しません。

project ID、connection string、token、admin credential、plan確認文字列、deploy承認は入力しません。migrationがup-to-dateなら、品質検査、Vercel環境変数同期、direct Production deploy、canonical smokeまで無人で進みます。pending migrationがある場合だけplanを表示し、適用前に1回`[y/N]`で承認を求めます。拒否した場合はDB、Vercel環境変数、Productionを変更せず停止します。

次の両方が表示された時点でdeployとsmokeは成功です。

```text
Canonical smoke passed: <deployment ID>
Deployment completed: <deployment ID> (<commit SHA>)
```

Neon APIから動的URIを取得できない、対象が一致しない、migrationまたはcanonical smokeが失敗した場合はメンテナンスを解除しません。対象を広げたり古いconnection stringへ戻したり、新しいdeployを重ねたりせず、失敗phaseとNeon / Vercelの実状態を確認します。

canonical smokeまで成功したら、新しいProductionの管理画面から`PRODUCTION`のメンテナンスを`DISABLED`にします。canonical公開HTMLが200へ戻り、`Cache-Control: no-store`がメンテナンス応答として残っていないことを確認して初回切替を完了します。解除に失敗した場合は、認証だけが故障しDBが正常であることを確認できる時に限り[メンテナンスモード緊急解除](maintenance-recovery.md)を使います。

`BETTER_AUTH_SECRET`または既存admin credentialが一致しない場合はfail closedに停止し、自動生成・上書きしません。Production deploy後のcanonical smokeで失敗した場合、Productionはすでに変更済みです。[再デプロイの停止・失敗時](redeploy.md#停止失敗した場合)に従って実状態を確認します。

## 5. GitHub Actionsを追加する

ローカルで同じdeployが成功した後に、[GitHub Actions用AWS IAM / OIDC設定](aws-iam-oidc.md)を一回だけ行います。以後は[GitHub ActionsからProductionへ手動デプロイ](github-actions-redeploy.md)を利用できます。

ActionsでもVercel Git自動デプロイは使いません。main限定の`workflow_dispatch`が、validate / migration plan、必要時だけ`production-migration`承認、direct Production deploy、canonical smokeを順に実行します。
