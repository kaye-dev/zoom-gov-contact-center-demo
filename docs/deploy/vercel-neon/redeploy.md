# Vercel / Neonへローカルから再デプロイ

初回設定済み環境の2回目以降は、リポジトリルートの`./deploy.sh`だけを実行します。Node.js、Vercel CLI、Neon CLIを個別にhostへインストールする必要はありません。初めての場合は[既存Productionの初回設定と切替](initial-deploy.md)と[AWS Parameter Storeの初回設定](setup-deploy-aws.md)を先に完了してください。

GitHub Actionsから実行する場合は[GitHub ActionsからProductionへ手動デプロイ](github-actions-redeploy.md)を参照してください。

## 実行前の確認

- デプロイ対象がcommit済みで、worktreeがcleanである。
- Dockerが起動している。
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

`deploy.sh`は固定versionのdeploy runner imageを使い、Parameter Storeの4件を値を表示せずに取得します。保存済みのVercel / Neon対象をAPIで再確認し、Neonからpooled / direct connection stringを取得して次の順に処理します。

1. Gitのbranch / commit / clean worktree、AWS account、provider plan、project、domain、region、DB endpointを検証する。
2. test、lint、typecheck、runtime audit、Production buildを実行する。
3. migration状態、manifest、checksum、schema driftを検査する。
4. migrationがpendingの場合だけplanを表示し、1回だけ`[y/N]`で承認を求める。
5. migrationがup-to-dateであることを再確認し、Vercel Production環境変数を同期する。
6. 対象commitをVercel Productionへ直接deployし、返されたdeployment ID、project、commit、regionを照合する。
7. canonical URLの200 / 503、認証、robots meta、`X-Robots-Tag`、`robots.txt`、`sitemap.xml`をsmoke検証する。

migrationがup-to-dateなら、provider情報、project ID、connection string、管理者credential、plan確認文字列、deploy承認の入力はありません。pending migrationへの承認を拒否した場合は、DB、Vercel環境変数、Productionを変更せず停止します。

AWS IAM Identity Center sessionが失効している場合だけ、AWSへの再loginが必要です。これは保存値の再入力ではなく短期credentialの更新です。login後に同じ`./deploy.sh`を再実行します。

## 完了判定

次の両方が表示された時点で、スクリプト上の再デプロイは完了です。

```text
Canonical smoke passed: <deployment ID>
Deployment completed: <deployment ID> (<commit SHA>)
```

必要に応じてブラウザでも次を確認します。

1. `/`と内部リンクが正常に表示される。
2. `/login`から登録済み管理者でログインできる。
3. `/admin/users`が認証済みだけに表示される。
4. logout後に管理画面が未認証で保護される。

メンテナンス中は公開HTMLの503と`Cache-Control: no-store`が正常です。canonical smokeはDBの`PRODUCTION`設定に従って200または503を検証します。

## 設定変更とcredential rotation

通常の再デプロイではParameter Storeを編集しません。canonical origin、project、branch、database、role、管理者emailなどを変更する場合は次を実行し、対象を再検証してから保存します。

```bash
./setup-deploy-aws.sh --reconfigure
```

Vercel token、Neon API key、管理者passwordのうち1件だけを変更する場合は、対応するrotateコマンドを使います。

```bash
./setup-deploy-aws.sh --rotate vercel-token
./setup-deploy-aws.sh --rotate neon-api-key
./setup-deploy-aws.sh --rotate admin-password
```

profileをその回だけ指定する場合は各コマンドへ`--profile <AWS_PROFILE_NAME>`を追加します。`admin-password`は既存管理者でsmokeログインする保存値だけを更新し、管理者user自体は作成・更新しません。先にレビュー済みの管理画面操作で同じ管理者のpasswordを変更してからrotateします。rotationは対象SecureStringだけを新しいversionへ更新し、`config.secretVersions`との対応を保ちます。実行後は値を表示せず、次の通常デプロイでprovider認証と対象一致を検証します。

## 停止・失敗した場合

errorの直前に表示されたphaseを確認し、状態不明のまま再実行しません。

| 停止箇所 | 外部状態 | 対応 |
| --- | --- | --- |
| target / quality / migration plan | 外部変更なし | 設定またはコードを修正して再実行する |
| migration apply / verify | DBが一部または全部変更済みの可能性あり | Neon migration状態とschemaを確認し、自動rollbackしない |
| Vercel env sync / Production deploy | 環境変数またはProductionが変更済みの可能性あり | Vercel deployment IDと最後に成功した工程を確認する |
| canonical smoke | Productionはすでに公開済み | deployを重ねず、canonicalの実状態を確認して復旧する |

DB migrationはVercelのrollbackでは戻りません。認証だけが故障した場合やDB停止時は[メンテナンスモード緊急解除](maintenance-recovery.md)を参照してください。
