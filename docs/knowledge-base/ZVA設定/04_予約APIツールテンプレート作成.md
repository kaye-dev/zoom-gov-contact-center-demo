# 予約APIツールテンプレート作成

Zoom Virtual Agent（ZVA）から予約APIを呼び出すツールテンプレートを、APIコール7件とカスタムスクリプト1件の順で作成します。

## 準備

1. リポジトリルートでアプリを起動します。

   ```bash
   ./dev-compose.sh
   ```

2. [予約APIキー管理](http://localhost:3000/admin/reservations/api-keys)でAPIキーを発行し、`LIST`、`READ`、`CREATE`、`UPDATE`、`DELETE`を付与します。
3. 次の共通値を使用します。実際のAPIキーはこの文書やGitに保存しません。

   | 項目 | 作成時の値 |
   | --- | --- |
   | Base URL | `http://localhost:3000` |
   | Authorization | `Bearer REPLACE_WITH_RESERVATION_API_KEY` |
   | タイムアウト | `10`秒 |

`localhost`はZoomのクラウドから到達できません。テンプレート作成後、Debugを実行する前にBase URLを外部公開されたHTTPS URLへ、Authorizationを発行済みAPIキーへ置き換えます。

## 共通操作

1. Zoom Webポータルで`Admin Center` → `Product configuration` → `AI Studio` → `Tool Templates` → `Custom`を開きます。
2. `ツールを追加`を押します。
3. 1〜7件目は`APIコール`、8件目は`カスタムスクリプト`を選びます。
4. APIコールでは、各節の名前、説明、メソッド、URL、入力、出力を設定します。
5. APIコールのリクエストヘッダーへ次を追加します。

   | 名前 | 場所 | 型 | 必須 | 値の指定元 | 値 |
   | --- | --- | --- | --- | --- | --- |
   | `Authorization` | Header | String | はい | 手動 | `Bearer REPLACE_WITH_RESERVATION_API_KEY` |

6. `Virtual Agent`の出力へ各節のレスポンス項目を追加し、タイムアウトを`10`秒にして保存します。

APIコール7件には、各節の出力に加えて次の異常系出力を追加します。`requestId`が各節にある場合は重複して追加しません。

| 名前 | 型 |
| --- | --- |
| `error` | String |
| `message` | String |
| `retryable` | Boolean |
| `requestId` | String |
| `details` | Object |

## 1. 予約サービス一覧

| 項目 | 値 |
| --- | --- |
| 名前 | `mirai_reservation_list_services` |
| 説明 | 予約可能なサービス種別と予約方式、曜日、時間枠、定員を確認するときに使用します。予約作成前に有効なserviceKeyを特定するために呼び出してください。 |
| メソッド | `GET` |
| URL | `http://localhost:3000/api/public/v1/reservation-services` |

追加の入力はありません。出力を次のとおり設定します。

| 名前 | 型 |
| --- | --- |
| `resultCode` | String |
| `requestId` | String |
| `services` | Array |

## 2. 予約空き枠取得

| 項目 | 値 |
| --- | --- |
| 名前 | `mirai_reservation_get_availability` |
| 説明 | 指定した予約サービスと日付範囲の空き枠、開始時刻、残数を確認するときに使用します。予約作成前にserviceKeyと31日以内の日付範囲を指定して呼び出してください。 |
| メソッド | `GET` |
| URL | `http://localhost:3000/api/public/v1/reservation-services/{serviceKey}/availability` |

入力を次のとおり設定します。

| 名前 | 場所 | 型 | 必須 | 値の指定元 | 説明 |
| --- | --- | --- | --- | --- | --- |
| `serviceKey` | Path | String | はい | LLM | 予約サービス一覧で取得したキー |
| `dateFrom` | Query | String | はい | LLM | 開始日。`YYYY-MM-DD` |
| `dateTo` | Query | String | はい | LLM | 終了日。`dateFrom`以降、両端を含め31日以内 |

出力を次のとおり設定します。

| 名前 | 型 |
| --- | --- |
| `resultCode` | String |
| `requestId` | String |
| `availability` | Object |

## 3. 予約一覧

| 項目 | 値 |
| --- | --- |
| 名前 | `mirai_reservation_list` |
| 説明 | 予約履歴をサービス、日付範囲、ページ条件で検索するときに使用します。条件を省略でき、nextCursorがある場合は続きの取得に再利用してください。 |
| メソッド | `GET` |
| URL | `http://localhost:3000/api/public/v1/reservations` |

入力を次のとおり設定します。すべて任意です。

| 名前 | 場所 | 型 | 値の指定元 | 説明 |
| --- | --- | --- | --- | --- |
| `serviceKey` | Query | String | LLM | 予約サービスのキー |
| `dateFrom` | Query | String | LLM | 開始日。`YYYY-MM-DD` |
| `dateTo` | Query | String | LLM | 終了日。`YYYY-MM-DD` |
| `limit` | Query | Number | LLM | 1〜100。省略時は50 |
| `cursor` | Query | String | LLM | 前回レスポンスの`nextCursor` |

出力を次のとおり設定します。

| 名前 | 型 |
| --- | --- |
| `resultCode` | String |
| `requestId` | String |
| `items` | Array |
| `nextCursor` | String |

## 4. 予約作成

| 項目 | 値 |
| --- | --- |
| 名前 | `mirai_reservation_create` |
| 説明 | 利用者の合意後に予約を新規作成するときに使用します。事前にサービスと空き枠を確認し、同じ予約意図の再試行では同じ冪等性キーと外部参照IDを再利用してください。 |
| メソッド | `POST` |
| URL | `http://localhost:3000/api/public/v1/reservations` |

入力を次のとおり設定します。

| 名前 | 場所 | 型 | 必須 | 値の指定元 | 値または説明 |
| --- | --- | --- | --- | --- | --- |
| `Content-Type` | Header | String | はい | 手動 | `application/json` |
| `Idempotency-Key` | Header | String | はい | LLM | 16〜100文字の英数字、`_`、`-`。`externalReferenceId`と同じ値にし、同じ予約意図の再試行では再利用 |
| `serviceKey` | Body | String | はい | LLM | 予約サービス一覧で取得したキー |
| `reservationDate` | Body | String | はい | LLM | 予約日。`YYYY-MM-DD` |
| `startMinute` | Body | Number | はい | LLM | 0〜1439の開始分 |
| `externalReferenceId` | Body | String | はい | LLM | `Idempotency-Key`と同じ16〜100文字の不透明なID。個人情報を含めず、同じ予約意図の再試行では再利用 |

出力を次のとおり設定します。

| 名前 | 型 |
| --- | --- |
| `resultCode` | String |
| `requestId` | String |
| `reservationId` | String |
| `version` | Number |
| `reservation` | Object |

## 5. 予約詳細取得

| 項目 | 値 |
| --- | --- |
| 名前 | `mirai_reservation_get` |
| 説明 | 予約IDから最新の予約内容とversionを取得するときに使用します。更新または削除の前に呼び出し、返されたversionからIf-Matchを組み立ててください。 |
| メソッド | `GET` |
| URL | `http://localhost:3000/api/public/v1/reservations/{id}` |

入力を次のとおり設定します。

| 名前 | 場所 | 型 | 必須 | 値の指定元 | 説明 |
| --- | --- | --- | --- | --- | --- |
| `id` | Path | String | はい | LLM | 対象の予約ID |

出力を次のとおり設定します。

| 名前 | 型 |
| --- | --- |
| `resultCode` | String |
| `requestId` | String |
| `reservationId` | String |
| `version` | Number |
| `reservation` | Object |

## 6. 予約完全更新

| 項目 | 値 |
| --- | --- |
| 名前 | `mirai_reservation_replace` |
| 説明 | 利用者が変更内容を確認した後、予約の全項目を置き換えるときに使用します。事前に詳細取得で最新versionを確認し、競合時は上書きせず再確認してください。 |
| メソッド | `PUT` |
| URL | `http://localhost:3000/api/public/v1/reservations/{id}` |

入力を次のとおり設定します。

| 名前 | 場所 | 型 | 必須 | 値の指定元 | 値または説明 |
| --- | --- | --- | --- | --- | --- |
| `id` | Path | String | はい | LLM | 対象の予約ID |
| `If-Match` | Header | String | はい | LLM | `"reservation-{id}-v{version}"`形式のstrong ETag |
| `Content-Type` | Header | String | はい | 手動 | `application/json` |
| `serviceKey` | Body | String | はい | LLM | 予約サービスのキー |
| `reservationDate` | Body | String | はい | LLM | 予約日。`YYYY-MM-DD` |
| `startMinute` | Body | Number | はい | LLM | 0〜1439の開始分 |
| `externalReferenceId` | Body | String | はい | LLM | 作成時の外部参照ID |

出力を次のとおり設定します。

| 名前 | 型 |
| --- | --- |
| `resultCode` | String |
| `requestId` | String |
| `reservationId` | String |
| `version` | Number |
| `reservation` | Object |

## 7. 予約削除

| 項目 | 値 |
| --- | --- |
| 名前 | `mirai_reservation_delete` |
| 説明 | 利用者が取消対象と取消意思を明確に確認した後、予約を削除するときに使用します。事前に詳細取得で最新versionを確認し、競合時は削除せず再確認してください。 |
| メソッド | `DELETE` |
| URL | `http://localhost:3000/api/public/v1/reservations/{id}` |

入力を次のとおり設定します。

| 名前 | 場所 | 型 | 必須 | 値の指定元 | 説明 |
| --- | --- | --- | --- | --- | --- |
| `id` | Path | String | はい | LLM | 対象の予約ID |
| `If-Match` | Header | String | はい | LLM | `"reservation-{id}-v{version}"`形式のstrong ETag |

成功時は`204 No Content`のため成功出力を追加しません。共通の異常系出力だけを設定します。

## 8. 予約部分更新

ZoomのAPIコールは`PATCH`を選択できないため、カスタムスクリプトで作成します。

| 項目 | 値 |
| --- | --- |
| 名前 | `mirai_reservation_update_partial` |
| 説明 | 利用者が変更内容を確認した後、予約の指定項目だけを部分更新するときに使用します。事前に最新versionを確認し、少なくとも1項目を指定し、競合時は上書きしません。 |
| タイムアウト | `10`秒 |

入力を次のとおり設定します。

| 名前 | 型 | 必須 | 値の指定元 | 値または説明 |
| --- | --- | --- | --- | --- |
| `authorization` | String | はい | 手動 | `Bearer REPLACE_WITH_RESERVATION_API_KEY` |
| `id` | String | はい | LLM | 対象の予約ID |
| `version` | Number | はい | LLM | 予約詳細取得で得た最新version |
| `serviceKey` | String | いいえ | LLM | 変更する場合だけ指定 |
| `reservationDate` | String | いいえ | LLM | 変更する場合だけ`YYYY-MM-DD`で指定 |
| `startMinute` | Number | いいえ | LLM | 変更する場合だけ0〜1439で指定 |
| `externalReferenceId` | String | いいえ | LLM | 変更する場合だけ指定 |

出力を次のとおり設定します。

| 名前 | 型 |
| --- | --- |
| `httpStatus` | Number |
| `resultCode` | String |
| `requestId` | String |
| `reservationId` | String |
| `version` | Number |
| `reservation` | Object |
| `etag` | String |
| `error` | String |
| `retryable` | Boolean |
| `details` | Object |

JavaScriptエディターへ次を貼り付けます。

外部公開後は、コード内の`http://localhost:3000`も外部公開されたHTTPS URLへ置き換えます。

```javascript
async function main() {
  var variables = var_get();
  var authorization = variables["authorization"];
  var id = variables["id"];
  var version = var_get_with_type("version", "number");
  var serviceKey = variables["serviceKey"];
  var reservationDate = variables["reservationDate"];
  var startMinute = var_get_with_type("startMinute", "number");
  var externalReferenceId = variables["externalReferenceId"];

  if (!authorization || !id || !Number.isInteger(version) || version < 1) {
    return {
      httpStatus: 400,
      resultCode: "",
      requestId: "",
      reservationId: "",
      version: 0,
      reservation: {},
      etag: "",
      error: "INVALID_TOOL_INPUT",
      retryable: false,
      details: { message: "authorization, id, and a positive integer version are required." }
    };
  }

  var body = {};
  if (serviceKey !== undefined && serviceKey !== null && serviceKey !== "") {
    body.serviceKey = serviceKey;
  }
  if (reservationDate !== undefined && reservationDate !== null && reservationDate !== "") {
    body.reservationDate = reservationDate;
  }
  if (startMinute !== undefined && startMinute !== null && startMinute !== "") {
    body.startMinute = startMinute;
  }
  if (externalReferenceId !== undefined && externalReferenceId !== null && externalReferenceId !== "") {
    body.externalReferenceId = externalReferenceId;
  }

  if (Object.keys(body).length === 0) {
    return {
      httpStatus: 400,
      resultCode: "",
      requestId: "",
      reservationId: id,
      version: version,
      reservation: {},
      etag: "",
      error: "NO_UPDATE_FIELDS",
      retryable: false,
      details: { message: "At least one reservation field must be supplied." }
    };
  }

  var url = "http://localhost:3000/api/public/v1/reservations/" + encodeURIComponent(id);
  var config = {
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json",
      "If-Match": "\"reservation-" + id + "-v" + version + "\""
    }
  };

  try {
    var response = await req.patch(url, body, config);
    var data = response && response.data ? response.data : {};
    var headers = response && response.headers ? response.headers : {};

    return {
      httpStatus: response && response.status ? response.status : 0,
      resultCode: data.resultCode || "",
      requestId: data.requestId || "",
      reservationId: data.reservationId || id,
      version: data.version || 0,
      reservation: data.reservation || {},
      etag: headers.etag || headers.ETag || "",
      error: data.error || "",
      retryable: data.retryable === true,
      details: data.details || {}
    };
  } catch (error) {
    var failedResponse = error && error.response ? error.response : null;
    var failedData = failedResponse && failedResponse.data ? failedResponse.data : {};

    return {
      httpStatus: failedResponse && failedResponse.status ? failedResponse.status : 0,
      resultCode: failedData.resultCode || "",
      requestId: failedData.requestId || "",
      reservationId: failedData.reservationId || id,
      version: failedData.version || version,
      reservation: failedData.reservation || {},
      etag: "",
      error: failedData.error || "TRANSPORT_ERROR",
      retryable: failedData.retryable === true || !failedResponse,
      details: failedData.details || { message: String(error) }
    };
  }
}
```

## 確認

1. `カスタム`の一覧に次の8件が1件ずつ表示されることを確認します。

   | 種別 | 名前 |
   | --- | --- |
   | APIコール | `mirai_reservation_list_services` |
   | APIコール | `mirai_reservation_get_availability` |
   | APIコール | `mirai_reservation_list` |
   | APIコール | `mirai_reservation_create` |
   | APIコール | `mirai_reservation_get` |
   | APIコール | `mirai_reservation_replace` |
   | APIコール | `mirai_reservation_delete` |
   | カスタムスクリプト | `mirai_reservation_update_partial` |

2. APIコール7件のURLとカスタムスクリプト内のURLを外部公開されたHTTPS URLへ、Authorizationを実APIキーへ置き換えます。
3. 各テンプレートの`Debug`で正常系を確認します。
4. エラーは`message`ではなく`error`と`retryable`で分岐します。予約枠満了は`409 RESERVATION_SLOT_FULL`、更新競合は`412`、`If-Match`欠落は`428`、月間上限は`429`として扱います。

## 参考情報

- [予約API OpenAPI](../../development/reservation-api.openapi.json)
- [予約APIのcurl動作確認](../../development/reservation-api-curl.md)
- [Creating Zoom Virtual Agent tools](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0081099)
