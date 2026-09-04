# Vercel / Neonへローカルから再デプロイ

初回設定済み環境の2回目以降は、リポジトリルートの`./deploy.sh`だけを実行します。Node.js、Vercel CLI、Neon CLIを個別にhostへインストールする必要はありません。初めての場合は[既存Productionの初回設定と切替](initial-deploy.md)と[AWS Parameter Storeの初回設定](setup-deploy-aws.md)を先に完了してください。

GitHub Actionsから実行する場合は[GitHub ActionsからProductionへ手動デプロイ](github-actions-redeploy.md)を参照してください。

## 実行前の確認

- デプロイ対象がcommit済みで、worktreeがcleanである。
- Dockerが起動し、4 GB-class（`4,000,000,000` bytes以上）の利用可能メモリを持つ。Colimaでは4 GiB以上を構成する。
- 初回設定時と同じAWS accountのIAM Identity Center profileを利用できる。
- Vercel Hobby / Neon Freeを使う個人・非商用デモであり、本番データや日本国内のデータ所在要件がない。
- 同時に別のProduction deployやmigrationを実行していない。

```bash
cd /Users/keien/dev/zoom/zoom-gov-contact-center-demo
git status --short
./deploy.sh
```

`.env`の`DEPLOY_AWS_PROFILE`を使わず、その回だけprofileを明示する場合は次の形式です。

```bash
./deploy.sh --profile <AWS_PROFILE_NAME>
```

`<AWS_PROFILE_NAME>`は秘密値ではありません。shell historyへtoken、API key、database URL、passwordを入力しません。

## 実行中の動作

`deploy.sh`はclean worktree確認後、AWS profile、STS、SSM、deploy runner image buildより前にDockerメモリを検査します。4 GB-class以上なら追加入力なしで続行します。不足時は、明示的なDocker endpoint overrideがなく、active context、socket、`colima status <profile> --json`から現在のdaemonを所有するColima profileを完全に特定でき、稼働containerが0件の場合だけ、Colimaを4 GiBへ変更して再起動するか`[y/N]`で確認します。

明示的な`y`または`yes`を入力すると、endpointと稼働container 0件を再確認してからexact profileを通常stop/startします。再起動後にprofile、socket、構成メモリ、Dockerメモリを再検証できた場合だけ、再帰実行せず同じ`deploy.sh`のAWS認証以降へ進みます。稼働containerあり、非対話、拒否、Colima以外のengine、Docker endpoint override、所有権不一致では、自動停止や設定変更を行いません。

`deploy.sh`は固定versionのdeploy runner imageを使い、Parameter Storeの4件を値を表示せずに取得します。`config`が初回setupまたはcredential更新の途中状態なら、同じprofileで`./setup-deploy-aws.sh`を再実行するよう案内し、Production関連処理を始めず停止します。完了済みの場合は保存されたVercel / Neon対象をAPIで再確認し、Neonからpooled / direct connection stringを取得します。Neon APIが返すraw URIは手編集せず、runnerが`sslmode=require`または`sslmode=verify-full`を検証してmemory上で`sslmode=verify-full`へ正規化します。正規化済みdirect URIはmigrationとDB検証のprocess内だけで使い、pooled URIだけをVercel Productionの`DATABASE_URL`へ同期して、次の順に処理します。

1. Gitのbranch / commit / clean worktree、AWS account、provider plan、project、domain、region、DB endpointを検証する。
2. test、lint、typecheck、runtime audit、Production buildを実行する。
3. migration状態、manifest、checksum、schema driftを検査する。
4. migrationがpendingの場合だけplanを表示し、1回だけ`[y/N]`で承認を求める。
5. migrationがup-to-dateであることを再確認し、Vercel Production環境変数を同期する。
6. 対象commitをVercel Productionへ直接deployし、返されたdeployment ID、project、commit、regionを照合する。
7. canonical URLの200 / 503、認証、robots meta、`X-Robots-Tag`、`robots.txt`、`sitemap.xml`をsmoke検証する。

migrationがup-to-dateなら、provider情報、project ID、connection string、管理者credential、plan確認文字列、deploy承認の入力はありません。pending migrationへの承認を拒否した場合は、DB、Vercel環境変数、Productionを変更せず停止します。

通常の`deploy.sh`がexact `admin-access-v1` batchを検出して停止した場合だけ、[review済みadmin access migrationのProduction適用](reviewed-admin-access-migration.md)に従います。このsingle-purpose手順でDBをup-to-dateにした後は、通常の`./deploy.sh`とGitHub Actionsへ戻ります。

AWS IAM Identity Center sessionが失効している場合だけ、AWSへの再loginが必要です。これは保存値の再入力ではなく短期credentialの更新です。login後に同じ`./deploy.sh`を再実行します。

## 完了判定

対話terminalではphaseがcyan、警告がyellow、成功がgreenで表示されます。pipe、redirect、GitHub Actions、`NO_COLOR`指定時はANSI colorを出しませんが、同じ記号と文言を表示します。

canonical smokeの成功後、最後に次のbannerが表示された時点で、スクリプト上の再デプロイは完了です。途中の`Production deployment verified`だけでは完了ではありません。

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ PRODUCTION DEPLOYMENT SUCCEEDED
  Productionデプロイに成功しました。
  Canonical URL : <canonical origin>
  Deployment ID: <deployment ID>
  Git commit    : <commit SHA>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

必要に応じてブラウザでも次を確認します。

1. `/`と内部リンクが正常に表示される。
2. `/login`から登録済み管理者でログインできる。
3. `/admin/users`が認証済みだけに表示される。
4. logout後に管理画面が未認証で保護される。

メンテナンス中は公開HTMLの503と`Cache-Control: no-store`が正常です。canonical smokeはDBの`PRODUCTION`設定に従って200または503を検証します。

## 設定変更とcredential rotation

通常の再デプロイではParameter Storeを編集しません。設定を変更する場合は`setup-deploy-aws.sh`を引数なしで実行します。非秘密項目は現在値、秘密項目は値を伏せたSSM versionとともに一覧表示されるため、更新対象を1件選択します。空入力または`0`は変更せず検証だけを行います。

```bash
./setup-deploy-aws.sh
```

メニューの`1`から`10`ではcanonical origin、project、branch、database、role、管理者emailなどの非秘密設定を1件、`11`から`13`ではVercel token、Neon API key、管理者passwordを1件更新できます。選択した項目だけを再入力し、完成形の対象をAPIで検証してから保存します。入力形式や秘密値の確認不一致では同じ項目だけを再入力します。別の項目も変更する場合は、完了後にもう一度実行します。

更新対象をcommandで明示する従来の運用では、非秘密設定をまとめて再入力する`--reconfigure`と、秘密値を指定する`--rotate`を利用できます。

```bash
./setup-deploy-aws.sh --reconfigure
./setup-deploy-aws.sh --rotate vercel-token
./setup-deploy-aws.sh --rotate neon-api-key
./setup-deploy-aws.sh --rotate admin-password
```

profileをその回だけ指定する場合は各コマンドへ`--profile <AWS_PROFILE_NAME>`を追加します。`admin-password`は既存管理者でsmokeログインする保存値だけを更新し、管理者user自体は作成・更新しません。先にレビュー済みの管理画面操作で同じ管理者のpasswordを変更してから更新します。秘密値の更新は対象`SecureString`だけを新しいversionへ更新し、`config.secretVersions`との対応を保ちます。途中でAWS / provider APIエラーや中断が発生した場合は自動再試行せず、次のsetup実行で保存済みversionを照合して再開します。実行後は値を表示せず、次の通常デプロイでprovider認証と対象一致を検証します。

## 停止・失敗した場合

errorの直前に表示されたphaseを確認し、状態不明のまま再実行しません。

Docker memory preflightで停止した場合、AWS、DB、Vercelの処理は未開始です。稼働container、active Docker context、endpoint、対象profileを確認し、Colima以外のengineや明示的なendpoint overrideではengine側で4 GiB以上を手動設定します。承認後のColima stop/startまたは再検証に失敗した場合は、別profileを起動したりforce stop/deleteしたりせず、`colima status <profile>`でexact profileを確認し、停止中なら`colima start <profile> --memory 4 --save-config`で通常起動してから同じ`./deploy.sh`を再実行します。

TLSの証明書chainまたはhostname検証に失敗した場合は、`sslmode=require`、`no-verify`、`NODE_TLS_REJECT_UNAUTHORIZED=0`へfallbackしません。下表で失敗phaseの外部状態を判定し、対象の証明書、hostname、Neon endpointを修復してから既存経路を再実行します。

| 停止箇所                            | 外部状態                                       | 対応                                                   |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| Docker memory preflight             | Colima以外の外部変更なし                       | engine/profile/containerを確認して4 GiB以上へ復旧する  |
| target / quality / migration plan   | 外部変更なし                                   | 設定またはコードを修正して再実行する                   |
| migration apply / verify            | DBが一部または全部変更済みの可能性あり         | Neon migration状態とschemaを確認し、自動rollbackしない |
| Vercel env sync / Production deploy | 環境変数またはProductionが変更済みの可能性あり | Vercel deployment IDと最後に成功した工程を確認する     |
| canonical smoke                     | Productionはすでに公開済み                     | deployを重ねず、canonicalの実状態を確認して復旧する    |

### migration適用後にschema driftで停止した場合

migration applyが成功した後のverifyでschema driftを検出した場合は、DBが変更済みでVercel Production deployは未開始の状態として扱います。状態不明のまま同じrunや`./deploy.sh`を再実行しません。

1. 既存deploy runnerのread-only診断から`_prisma_migrations`、`prisma migrate status`、`prisma migrate diff`を確認し、適用済み、pending、failed、rolled-back、checksum不一致を区別する。database URLやcredentialをterminal、issue、logへ転記しない。
2. migrationが適用済みでpendingがなく、diffが物理名metadataだけの場合は、適用済みmigration SQLや`_prisma_migrations`を変更せず、`schema.prisma`のmapping修正を新しいcommitとしてreviewする。
3. 自動rollback、indexの手動rename、standalone SQL、`prisma migrate resolve`、`prisma db push`でdriftを消さない。failed、rolled-back、checksum不一致、想定外のdiffは個別のmigration復旧調査へ戻す。
4. 修正SHAの`Deploy runner npm test`に含まれる隔離DBのmigration/schema parityと他のCI checkが成功し、`main`へ反映されたことを直接確認してから、新しいdeployを開始する。

DB migrationはVercelのrollbackでは戻りません。認証だけが故障した場合やDB停止時は[メンテナンスモード緊急解除](maintenance-recovery.md)を参照してください。
