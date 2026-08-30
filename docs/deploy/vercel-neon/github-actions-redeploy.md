# GitHub ActionsからProductionへ手動デプロイ

この手順は、初回設定済みのVercel / Neon環境をGitHub Actionsから手動で再デプロイするrunbookです。VercelのGit自動デプロイは使用しません。フォーク先を初めて設定する場合は、[フォーク先のGitHub Actions初回設定](github-actions-setup.md)を上から実施してください。

## 実行前の確認

- デプロイ対象が`main`へmerge済みで、必須CIが成功している。
- GitHub Environmentsの`production-deploy`と`production-migration`が`main`だけを許可している。
- `production-migration`にrequired reviewerが設定されている。
- 実行中の別Production deployがない。並行起動したrunは同じconcurrency groupで直列化され、進行中のrunはcancelされない。
- AWS IAM Role、KMS key、4件のParameter Store設定を変更した場合は、先に権限テストをやり直している。

## 実行する

1. GitHub repositoryの`Actions`を開く。
2. `Manual production deployment`を選ぶ。
3. `Run workflow`を開き、branchが`main`であることを確認する。
4. `Run workflow`を選ぶ。追加のtoken、project ID、database URL、plan確認文字列は入力しない。

## credentialと実行コードの境界

各jobは新しいGitHub-hosted runnerで、次の順序を毎回やり直します。

1. `main`の`GITHUB_SHA`をcheckoutし、ref、40桁SHA、実際の`HEAD`が一致することを検証する。
2. `git archive "$GITHUB_SHA"`をprivate temporary build contextへ展開し、その中の`Dockerfile.deploy`からSHA付きdeploy runner imageをbuildする。
3. Docker buildが完了してからGitHub OIDCで短期AWS credentialを取得する。
4. hostのAWS CLIだけでSTS accountを照合し、4件のexact parameterを`GetParameters --with-decryption`で一括取得する。
5. SSM JSONと成功markerをpipeでdeploy runnerのstdinへ渡し、phaseを実行する。

Node.js、npm、Vercel CLI、repositoryのTypeScript / lifecycle scriptはhostで実行しません。`npm ci`とVercel CLI installを含むDocker buildはOIDC取得前なので、package lifecycleへAWS credentialが露出しません。Vercelへuploadされるtreeもworking directoryの可変状態ではなく、buildした`GITHUB_SHA`のarchiveです。

phase containerへbind mountするhost pathはpermission `0700`のoutput directoryだけです。hostのcheckout directory、`~/.aws`はmountせず、AWS / OIDC credential environmentとGitHub tokenも渡しません。対象commitのarchiveはOIDC取得前にimageへ固定済みです。秘密値を含むSSM JSONはenvironment、argv、fileにせずstdinだけで渡し、末尾の成功markerがないpartial responseは拒否します。

validate / releaseのresultはmount内へexclusive・`0600`で作成します。hostはowner、mode、行数、key、value形式を検証し、許可した非秘密値だけを`GITHUB_OUTPUT`へ転記します。生のresult、SSM JSON、database URLはartifact、cache、job outputへ出しません。

workflowは同じ`GITHUB_SHA`に対して次の順で動きます。

| Job | Environment | 処理 | Productionへの変更 |
| --- | --- | --- | --- |
| `Validate and plan migration` | `production-deploy` | AWS OIDC、Parameter Store再取得、対象/plan/品質検査、migration plan | なし |
| `Approve and apply production migration` | `production-migration` | plan digestを照合し、Neon状態を再取得してmigrationを適用・検証 | pendingの場合だけDBを変更 |
| `Deploy directly to Production` | `production-deploy` | Parameter Storeを再取得し、Vercel環境変数同期後に対象SHAをProductionへ直接deploy | Vercel Productionを変更 |
| `Verify the canonical Production deployment` | `production-deploy` | deployment IDを照合し、canonical URLの200 / 503、認証、robots、sitemapをsmoke検証 | なし |

validateはpending migrationを検出しても正常終了し、`migration-required`で承認jobを条件分岐します。`plan-digest`はmigrationのTOCTOU照合に使い、Stored Deployment Config全体から作る`target-fingerprint`はmigrate、release、smokeが同じAWS / Vercel / Neon対象とsecret versionを使うことの照合に使います。releaseが出力する`deployment-id`と`previous-deployment-id`は、canonical smoke失敗時の新旧deployment照合と手動復旧にだけ使います。いずれも形式検証済みの非秘密値です。各jobはOIDCの短期credentialを取り直し、Parameter StoreとNeonから必要情報を再取得します。Vercel token、Neon API key、管理者password、database URLはjob間で渡しません。

## migrationの承認

pending migrationがないrunでは`production-migration` jobはskipされ、そのままdirect Production deployへ進みます。

pending migrationがあるrunは`production-migration` Environmentの承認待ちになります。承認前に次を確認します。

1. 対象commitが起動した`main`のSHAと一致する。
2. migration一覧とplan digestがvalidate jobの結果として出ている。
3. failed、diverged、checksum不一致、schema drift、未登録migrationがない。
4. 変更内容、影響時間、復旧手順を理解している。
5. canonical URLとNeon対象projectが想定どおりである。

承認後もmigration jobはParameter Store、Neon状態、migration planを再取得し、validate時のplan digestと一致しない場合はDBを変更せず停止します。承認を拒否した場合、Production deployは実行されません。

## 完了判定

`Verify the canonical Production deployment`まで成功し、logの最後に`✓ PRODUCTION DEPLOYMENT SUCCEEDED`と対象canonical URL / commit / deployment IDが表示された時点で完了です。GitHub ActionsではANSI colorを出しませんが、記号と文言はlocal実行と同じです。`Deploy directly to Production`の成功だけでは受入完了としません。

ブラウザでも必要に応じて次を確認します。

1. canonical `/`と内部リンクが正常に表示される。
2. `/login`から登録済み管理者でログインできる。
3. `/admin/users`が認証済みだけに表示される。
4. logout後に管理画面が未認証で保護される。

メンテナンス中は公開HTMLの503と`Cache-Control: no-store`が正常です。canonical smokeはDBの`PRODUCTION`設定に従って200または503を検証します。

## 停止・失敗した場合

| 停止箇所 | 外部状態 | 対応 |
| --- | --- | --- |
| validate / plan | 外部変更なし | errorを修正してmainへmergeし、新しいrunを起動する |
| migration承認待ち / 拒否 | 外部変更なし | 内容を再確認し、同じrunを不用意に再利用せず判断する |
| migration apply / verify | DBが一部または全部変更済みの可能性あり | Neon migration状態とschemaを確認し、自動rollbackしない |
| env sync / Production deploy | Vercel環境変数またはProductionが変更済みの可能性あり | jobの最後に成功した工程とVercel deployment IDを確認する |
| canonical smoke | Productionはすでに公開済み | 新しいdeployを重ねず、canonicalの実状態を確認して復旧する |

workflowの`Re-run failed jobs`は、外部変更を伴うjobを再実行することがあります。状態不明のまま再実行しません。failure logに従って、Vercel deployment、Neon migration、canonical応答を確認します。認証だけが故障した場合やDB停止時は[メンテナンスモード緊急解除](maintenance-recovery.md)を参照してください。

DB migrationはVercel rollbackでは戻りません。canonical smoke失敗後も自動DB rollbackは行いません。
