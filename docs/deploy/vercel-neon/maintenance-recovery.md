# メンテナンスモード緊急解除

通常は管理画面のメンテナンス設定で対象環境を`DISABLED`にします。この手順は、認証だけが故障して管理画面へログインできず、Neon databaseへの接続とSQL実行が正常な場合に限る緊急手順です。

## 認証だけが故障している場合

Neon Consoleで対象project、branch、database、roleを確認してからSQL Editorを開きます。次のtransactionは`PRODUCTION`行がversion 1で正確に1件ある場合だけmodeとrevisionを更新します。保存済みの予約日時は消しません。

```sql
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';

DO $maintenance$
DECLARE
    affected_rows INTEGER;
BEGIN
    UPDATE public."site_maintenance_settings"
    SET
        "mode" = 'DISABLED',
        "revision" = "revision" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "environment" = 'PRODUCTION'
      AND "version" = 1;

    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one PRODUCTION version-1 maintenance row';
    END IF;
END
$maintenance$;

SELECT
    "environment",
    "version",
    "mode",
    "revision"
FROM public."site_maintenance_settings"
WHERE "environment" = 'PRODUCTION';

COMMIT;
```

結果が`PRODUCTION`、version `1`、`DISABLED`、正のrevisionの1行であることを確認し、canonical URLの公開HTMLが200へ戻ることを確認します。SQLが失敗した場合は対象やSQLを広げず、transactionがrollbackされたことを確認して停止します。

## databaseが停止している場合

DB接続が失敗している、または状態を確認できない場合は上記SQLを実行しません。公開HTMLがfail-closedの503を返すのが正常です。Neonの対象endpointと接続を復旧し、3環境行を読めることを確認した後、管理画面または上記transactionで解除します。

コードrollbackはメンテナンス設定の解除やDB復旧とは別操作です。Vercel deploymentをrollbackしてもdatabase migrationと設定行は戻らないため、同時に実行しません。
