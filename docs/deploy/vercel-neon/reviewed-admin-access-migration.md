# review済みadmin access migrationのProduction適用

このrunbookは、`admin-access-v1`として固定された4件のmigrationをProductionへ1回だけ適用するための運用手順です。通常の`./deploy.sh`はexpand-compatible migrationだけを自動適用する契約を維持し、このbatch以外のdestructive migrationには本手順を使用しません。

対象batchは次のexact migrationです。実行コードは名前だけでなくSQL SHA-256、classification、適用済み5件のprefix、Prisma status、schema drift、Productionのsource snapshotまで照合します。

| 順序 | Migration | Classification |
| --- | --- | --- |
| 1 | `20260827150000_add_admin_access_roles` | `destructive-reviewed` |
| 2 | `20260828120000_separate_admin_access_cas_revisions` | `destructive-reviewed` |
| 3 | `20260828180000_add_admin_access_mutation_freeze` | `expand-compatible` |
| 4 | `20260828210000_enforce_single_admin_access_role` | `destructive-reviewed` |

## 実行条件

- Production管理画面で期限のないメンテナンスを`ENABLED`にし、canonical公開HTMLが503と`Cache-Control: no-store`を返している。`SCHEDULED`は使用しない。
- 対象コードがcommit済みでworktreeがcleanである。実行中のcommit SHAをimmutableなdeploy runnerへ固定できない状態では開始しない。
- AWS Parameter Storeの設定が完了し、対象profileでSTS、4件のparameter、KMS復号を検証できる。
- Dockerが起動している。
- 同時に別のDB書き込み、migration、Production deploy、Neon branch操作を実行していない。
- Productionが適用済み5件とpending 4件のexact windowにあり、failed、rolled-back、diverged history、checksum不一致、schema driftがない。

条件を満たさない場合はmigration metadataやSQLを編集して合わせず、原因を解消してから検証をやり直します。

## 検証と適用

リポジトリルートから、single-purposeの内部scriptを実行します。

```bash
./scripts/deploy/reviewed-migrate-production.sh
```

`.env`の`DEPLOY_AWS_PROFILE`を使わず、その回だけprofileを指定する場合は次の形式です。

```bash
./scripts/deploy/reviewed-migrate-production.sh --profile <AWS_PROFILE_NAME>
```

最初のvalidation phaseは固定versionのDocker runnerで次を確認します。

1. clean worktree、commit SHA、AWS account、Parameter Store、Vercel/Neon provider target、現在のcanonical deployment ID、Productionメンテナンス503を検証する。
2. test、lint、typecheck、runtime audit、Production buildを実行する。
3. exact migration chain、Prisma status、schema drift、admin access適用前状態を検証する。
4. target fingerprint、review済みplan digest、現在のcanonical deployment ID、Production source snapshotを結び付けたoperation digestを作成する。

validation phaseはNeon branchを作成せず、Production DB、Vercel環境変数、Production deploymentを変更しません。logにはcommit SHAとmigration plan、private resultにはdigestだけを出し、Vercel token、Neon API key、管理者password、database URLは出力しません。秘密値とdatabase URLをshell history、`.env`、argv、artifactへ保存しません。

validation成功後、次の確認を1回だけ表示します。

```text
上記のreview済みmigration 4件をclone検証後にProductionへ適用しますか? [y/N]
```

拒否または空入力では外部変更を開始せず停止します。承認後は次の順序を固定し、途中工程をskipしません。

1. 承認済みcommit、target、plan、Production source snapshotを再照合する。
2. Production branchを親とする一意な`rehearsal/deploy-*` Neon child branchとread-write endpointを作成する。
3. child branchのparent、LSN、project、region、database、role、source snapshotがProductionと一致することを確認する。
4. child branchへexact 4件を適用し、up-to-date、schema、admin access role、revision、trigger、index、freeze設定を検証する。
5. child branchを削除し、削除完了をAPI readbackで確認する。cleanupを確認できなければProductionへ進まない。
6. Productionメンテナンス503、canonical deployment ID、source snapshotを再取得し、承認時のoperation digestと一致することを確認する。
7. Productionへexact 4件を1回適用し、up-to-dateと同じpost-migration条件を検証する。
8. 通常の`./deploy.sh`を同じprofile、承認済みGit SHA・branch・target fingerprintで起動し、Vercel Production環境変数同期、直接deploy、canonical smokeまで完了する。

## 完了判定

次の3点をすべて確認します。

1. `Reviewed Production migration is up to date.`が表示される。
2. 通常deployの`Canonical smoke passed`と`Deployment completed`が表示され、commit SHAとdeployment IDが一致する。
3. Production DBのmigrationとadmin access post-conditionがup-to-dateである。

scriptはメンテナンスを自動解除しません。deployとcanonical smokeの成功後、Production管理画面からメンテナンスを`DISABLED`にし、canonical公開HTMLが200へ戻ることを確認します。解除できない場合は、認証だけが故障しDBが正常な時に限り[メンテナンスモード緊急解除](maintenance-recovery.md)を使用します。

Production DBがup-to-dateになった後の再デプロイは通常の`./deploy.sh`を使用します。GitHub Actionsもこのexact batchを適用する経路にはせず、DBのup-to-date確認後に[通常の手動Production deploy](github-actions-redeploy.md)として利用します。

## 停止・復旧

Neon branchの作成・削除、migration、Vercel deployで応答が曖昧またはpartialになった場合、scriptは同じmutationを自動retryせず、DB migrationやdeploymentを自動rollbackしません。error直前のphaseと外部の実状態を確認するまで再実行しません。

| 停止箇所 | 外部状態 | 対応 |
| --- | --- | --- |
| validation / 承認拒否 | 外部変更なし | 設定、コード、exact windowを修正し、cleanなcommitから検証をやり直す |
| child branch作成 / rehearsal | `rehearsal/deploy-*` branchが作成済みまたは変更済みの可能性あり。Productionは未変更 | Neonのoperation、branch ID、parent branch、endpointをread-onlyで照合する。曖昧なまま作成や削除を繰り返さない |
| rehearsal cleanup | child branchが残っている可能性あり。Productionは未変更 | 対象がProduction branchでないこととexact child identityを確認し、cleanup完了を確認してから判断する |
| Production migration apply / verify | exact 4件の一部または全部が適用済みの可能性あり | Neonで`_prisma_migrations`、checksum、finished / rolled-back状態、schema、admin access post-conditionをread-only確認する。SQL編集、migration metadata変更、rollback、standalone deployを行わない |
| 通常deploy / canonical smoke | DBはup-to-date。Vercel環境変数またはProduction deploymentが変更済みの可能性あり | Vercel deployment ID、canonical割当、最後に成功したphaseを確認し、[再デプロイの復旧手順](redeploy.md#停止失敗した場合)に従う |

Production migrationを試行した後に失敗した場合は、review済み担当者が実状態を判定します。exact 4件とpost-conditionがすべてup-to-dateなら本scriptを再実行せず、通常の`./deploy.sh`から再開します。一部適用、checksum不一致、failed / rolled-back、schema drift、source snapshot不一致の場合は自動修復せず、メンテナンス503を維持したまま個別の復旧計画をレビューします。
