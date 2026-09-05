# Developer API暗号鍵の管理と本番導入

Developer APIのClient Secret / Secret Tokenは、アプリが`DEVELOPER_API_SETTINGS_ENCRYPTION_KEY`を使用してAES-256-GCMで暗号化します。AWS Systems Manager Parameter Storeを鍵の正本とし、release phaseがVercel ProductionへSensitive環境変数として同期します。通常のアプリ実行ではAWSへアクセスしません。

## 保管と同期

- Region: `ap-northeast-1`
- Parameter: `/zoom-gov-contact-center-demo/production/deploy/developer-api-settings-encryption-key`
- Type / tier: `SecureString` / `Standard`
- KMS: 既存の`alias/zoom-gov-contact-center-demo-production-deploy`が指す専用customer managed key
- 値: 初回セットアップ時に生成する32バイトの乱数の正規Base64表現
- Version: 完了configの`secretVersions.developerApiSettingsEncryptionKey`で管理

`setup-deploy-aws.sh`は既存の書き込み確認後に初回だけ鍵を生成し、AWS SDKで保存します。値は出力せず、再実行・`--reconfigure`・通常deployで再生成しません。`--rotate`の対象にも追加しません。完成済みconfigが参照する鍵の欠落、型・形式・versionの不整合、管理外の鍵を検出した場合は停止します。

通常deployは5件のparameterを一括取得し、鍵1件のexact Name filterで`DescribeParameters`を実行します。値の形式、configとSSMのversion、metadataの型・tier・KMS ARNを検証します。両方のAWS取得が成功した場合だけstdin末尾に完了markerを付け、phase container内で照合します。新しいversionはtarget fingerprintに含まれ、phase間で変わった場合も停止します。

[`DescribeParameters`のIAM仕様](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html)ではresource-level制御に対応していません。通常deploy用identityにも東京リージョンに限定した`Resource: "*"`のmetadata閲覧権限が必要です。この権限自体は同リージョンの他parameterのmetadata閲覧も可能ですが、秘密値の取得・復号はexact ARNとKMS encryption contextで限定します。[IAM設定](aws-iam-oidc.md)を参照してください。

Vercelの同期前検証は鍵の未登録を許容し、登録済みの場合はProduction / Sensitiveを要求します。同期後は既存6変数と合わせた7変数を必須とします。鍵の値を読み戻さず、同期commandの成功とmetadataを確認してデプロイします。環境変数の変更は新しいデプロイに反映されます。[Vercel環境変数](https://vercel.com/docs/environment-variables/managing-environment-variables)

## 旧設定からの移行

完了configはschema version 3、途中configはversion 4です。旧完了version 1と旧途中version 2はセットアップの移行用に読み取り、通常deployではセットアップの再実行を案内して停止します。

1. 明示された本番導入作業として、対象AWS account、Vercel project / Production deployment、Neon databaseを再確認する。
2. AWS / Vercelの鍵登録状況と、DBの`site_developer_api_settings`に暗号化済みデータがあるかを読み取り専用で調べる。秘密値・暗号文は出力せず、有無だけを確認する。既存データがあれば旧鍵の所在と継続利用を先に確定し、この初回生成手順は停止する。
3. setup・通常deploy・ActionsのIAM / KMS権限を更新する。新parameterのexact ARNとmetadata閲覧権限を先に反映する。
4. 新版の`./setup-deploy-aws.sh --profile <SETUP_PROFILE>`を実行する。旧設定の正常な3秘密値、provider設定、KMS keyを維持し、鍵の予定versionをversion 4の途中configへ記録してから、鍵を`Overwrite: false`で作成する。最後にversion 3の完了configを保存する。
5. 値を表示せず、完了config、既存parameterのversion保持、新鍵のversionを確認する。
6. 新版の通常deployを実行する。ローカルとActionsはいずれも新形式を使用する。移行後は旧デプロイスクリプトを実行しない。
7. canonical deploymentのID / commit、既存smokeの結果を確認する。その後、ユーザーがDeveloper APIのOAuth / Webhookの両設定を保存し、再読込・秘密値の再表示を確認する。鍵をログや報告へ貼り付けない。

コードの実装・テストの成功は本番復旧を意味しません。AWS / Vercelの変更、実際の保存操作と本番デプロイは独立した作業として記録します。

## 中断・失敗時

- 鍵作成前に中断した場合、予定versionと実parameterを照合してセットアップを再開する。作成後に中断した場合、保存済みの同じ鍵を使用して完了configの保存を再開する。
- 保存済みparameterの競合やversion不一致は自動上書きしない。完成済みconfigが参照する鍵が消失した場合、元の鍵を復旧し、代わりの鍵を生成しない。
- Vercel同期が失敗した場合は新規デプロイへ進まない。同期済みの環境変数がある可能性を確認し、AWSの同じ鍵を使って新版deployを再実行する。
- 初期導入前のVercel deploymentには鍵が含まれないため、そこへ戻すと保存エラーが再発し得る。復旧目的でSSM parameterを削除したり、configを旧schemaへ戻したりしない。アプリのrollbackも鍵を保持した新版deploy手順で扱う。

アプリ暗号鍵の交換には既存データの再暗号化を含む別設計が必要です。KMSの自動rotationはこのアプリ暗号鍵の値を変更せず、既存のKMS暗号文を復号できます。KMSの365日rotationは維持します。[AWS KMSのrotation仕様](https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html)
