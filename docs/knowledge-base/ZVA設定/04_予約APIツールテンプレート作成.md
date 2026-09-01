# 予約APIツールテンプレート作成

Zoom Virtual Agent（ZVA）から予約APIを呼び出すツールテンプレートを、APIコール7件とカスタムスクリプト1件の順で作成し、Skill Libraryへ登録します。

この手順は、2026年9月1日に`https://demo.lg.keien.dev`とZoom AI Studioの実画面で、8件すべてのDebugと予約の作成・取得・更新・取消まで確認した設定を反映しています。部分更新スクリプトのGET非200明示処理は、その後にZoom公式例を再確認して追加した未適用の安全修正です。Zoom側へ反映して正常系と非200系を再Debugするまでは、Agentを公開しません。

## 準備

1. ローカルでAPI contractを確認する場合は、リポジトリルートでアプリを起動します。

   ```bash
   ./dev-compose.sh
   ```

2. Zoom AI Studioから利用するAPIキーは、Productionの[予約APIキー管理](https://demo.lg.keien.dev/admin/reservations/api-keys)で発行します。

   最初に同名の有効なキーがないか確認し、設定済みのキーを理由なく重複発行しません。既存キーのraw値は再表示できないため、再設定またはローテーションが必要な場合だけ新しいキーを発行します。

   - 名前: `Zoom AI Studio 予約連携`
   - 権限: `LIST`、`READ`、`CREATE`、`UPDATE`、`DELETE`
   - 月間上限: `10,000`件

   raw APIキーは発行直後だけ表示されます。その場でAPIコール7件のAuthorizationとカスタムスクリプトの`authorization`へ設定し、この文書、Git、ログ、チャットには保存しません。ローテーション時は8件すべてを新しいキーへ変更してDebugし、成功確認後に旧キーを無効化します。

3. 次の共通値を使用します。

   | 項目 | 作成時の値 |
   | --- | --- |
   | Base URL | `https://demo.lg.keien.dev` |
   | Authorization | `Bearer REPLACE_WITH_RESERVATION_API_KEY` |
   | タイムアウト | `10`秒 |

`localhost`はZoomのクラウドから到達できません。Zoom AI Studioへ保存するURLには、最初からProductionのHTTPS URLを使用します。

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
| URL | `https://demo.lg.keien.dev/api/public/v1/reservation-services` |

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
| URL | `https://demo.lg.keien.dev/api/public/v1/reservation-services/{serviceKey}/availability` |

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
| URL | `https://demo.lg.keien.dev/api/public/v1/reservations` |

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
| URL | `https://demo.lg.keien.dev/api/public/v1/reservations` |

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
| URL | `https://demo.lg.keien.dev/api/public/v1/reservations/{id}` |

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
| URL | `https://demo.lg.keien.dev/api/public/v1/reservations/{id}` |

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
| URL | `https://demo.lg.keien.dev/api/public/v1/reservations/{id}` |

入力を次のとおり設定します。

| 名前 | 場所 | 型 | 必須 | 値の指定元 | 説明 |
| --- | --- | --- | --- | --- | --- |
| `id` | Path | String | はい | LLM | 対象の予約ID |
| `If-Match` | Header | String | はい | LLM | `"reservation-{id}-v{version}"`形式のstrong ETag |

成功時は`204 No Content`のため成功出力を追加しません。共通の異常系出力だけを設定します。

## 8. 予約部分更新

ZoomのAPIコールは`PATCH`を選択できません。また、2026年9月1日に本デモのProduction URLへNode.jsの`fetch`と`https.request`で、それぞれ単一の直接HTTPS PATCHを送信した検証では、クライアントが`412`を受け取った一方、直後のGETではversionが1から2へ進んでいました。同じserver-side実行が更新と`412`の両方を発生させたとは断定できず、transportまたは中継経路での再送、別リクエスト、同時更新の可能性を含めて原因は未特定です。この挙動を正常仕様として扱いません。OpenAPIとローカルのAPI contractはPATCHを引き続き提供しますが、更新済みか不明な状態で再実行すると意図しない変更につながるため、Zoomのカスタムスクリプトでは予約をGETし、未指定項目をマージしてPUTする方式を使用します。

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

  var url = "https://demo.lg.keien.dev/api/public/v1/reservations/" + encodeURIComponent(id);
  var readConfig = {
    headers: {
      "Authorization": authorization
    }
  };
  var updateConfig = {
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json",
      "If-Match": "\"reservation-" + id + "-v" + version + "\""
    }
  };

  try {
    var currentResponse = await req.get(url, readConfig);
    var currentData = currentResponse && currentResponse.data ? currentResponse.data : {};
    var currentStatus = currentResponse && currentResponse.status ? currentResponse.status : 0;

    if (currentStatus !== 200) {
      return {
        httpStatus: currentStatus,
        resultCode: currentData.resultCode || "",
        requestId: currentData.requestId || "",
        reservationId: currentData.reservationId || id,
        version: currentData.version || version,
        reservation: currentData.reservation || {},
        etag: "",
        error: currentData.error || "TRANSPORT_ERROR",
        retryable: currentData.retryable === true,
        details: currentData.details || {}
      };
    }

    var currentReservation = currentData.reservation || {};
    var mergedBody = {
      serviceKey: body.serviceKey !== undefined ? body.serviceKey : currentReservation.serviceKey,
      reservationDate: body.reservationDate !== undefined ? body.reservationDate : currentReservation.reservationDate,
      startMinute: body.startMinute !== undefined ? body.startMinute : currentReservation.startMinute,
      externalReferenceId: body.externalReferenceId !== undefined ? body.externalReferenceId : currentReservation.externalReferenceId
    };

    if (!mergedBody.serviceKey || !mergedBody.reservationDate ||
        !Number.isInteger(mergedBody.startMinute) || !mergedBody.externalReferenceId) {
      return {
        httpStatus: 502,
        resultCode: "",
        requestId: currentData.requestId || "",
        reservationId: id,
        version: version,
        reservation: {},
        etag: "",
        error: "INVALID_CURRENT_RESERVATION",
        retryable: false,
        details: { message: "The current reservation could not be merged safely." }
      };
    }

    var response = await req.put(url, mergedBody, updateConfig);
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
      details: failedData.details || { message: "The reservation request could not be completed." }
    };
  }
}
```

Zoom公式のCustom Script例は、`req.get`が例外を投げる場合だけでなく、非200のresponseを返す場合も`response.status`で判定しています。この手順のスクリプトも、GETの`error`、`requestId`、`retryable`を失わないよう、マージ前にstatusを確認します。transport例外の文字列はAuthorizationや内部情報を含む可能性があるためAgentへ返さず、固定メッセージへ置き換えます。この分岐は文書追加時点ではZoom側テンプレートへ未適用のため、反映後に200と制御された404をDebugし、結果を保存後に読み戻します。401はDebug入力だけを一時的に無効なAuthorizationへ差し替えて確認し、保存済みの静的値は変更しません。429はProduction上限を消費して発生させず、隔離したテストキーまたはAPI contract testで確認します。

このスクリプトの更新リクエストはPUTのため、成功時の`resultCode`は`RESERVATION_REPLACED`です。ツール名は部分更新のままですが、指定されていない項目は直前のGET結果で補完されます。入力された`version`はstrong `If-Match`に使用し、GETで得たversionへ自動的に置き換えません。競合時は`412`を返し、利用者の同意なく上書きしないためです。

変更系リクエストが非2xxまたは応答不明になった場合は、同じ操作をすぐ再実行しません。最初に`mirai_reservation_get`で現在の予約とversionを取得し、更新が適用済みかを確認します。

## Skill Library

### 公開前の停止条件

現行予約APIは静的APIキー単位で予約を分離し、会話中の利用者本人と予約所有者をserver-sideで照合しません。予約IDが第三者へ漏れた場合、同じAPIキーを使うAgentから詳細取得、変更、取消が可能です。

このため、`未来市の予約案内・予約管理`は管理者による制御されたデモとPreviewだけに使用します。利用者認証と予約所有者検証をAPI側へ実装して検証するまでは、公開Agentへ追加、Active化、Publishしません。公開環境でサービス・空き枠案内だけが必要な場合は、作成、詳細取得、全置換、部分更新、取消を含まないread-onlyスキルを別に作成します。

ツールテンプレートのDebugが完了したら、`AI Studio` → `Skill Library` → `スキルを作成`を開き、次を設定します。

| 項目 | 値 |
| --- | --- |
| 対応方式 | `General`（一般） |
| 名前 | `未来市の予約案内・予約管理` |
| トリガーの説明 | 利用者が未来市の予約可能なサービスや空き枠、予約内容を確認したいとき、または予約の新規作成、変更、取消を依頼したときに使用します。 |

`指示`へ次を貼り付けます。

```text
このスキルは、未来市の予約可能サービスと空き枠の案内、予約の作成、予約IDによる内容確認、変更、取消に使用する。

安全と適用範囲
- このスキルは管理者による制御されたデモとPreviewだけに使用する。利用者認証と予約所有者検証をAPI側で保証できない公開Agentでは、予約の詳細取得、作成、変更、取消を実行しない。
- serviceKeyを推測しない。未確定ならサービス一覧を取得して利用者に確認する。
- 予約一覧ツールは利用者単位に分離されていないため、このスキルでは絶対に使用しない。他の利用者の予約を検索、列挙、推測しない。
- serviceKeyがbulky-wasteの場合、サービスと空き枠の案内だけ行う。予約の作成、変更、取消は実行せず、現行の正式受付方法を案内する。
- Authorization、APIキー、Idempotency-Key、externalReferenceIdを利用者へ表示しない。APIにない本人確認、審査、料金、通知の完了を確定したと案内しない。

操作手順
1. サービスが未確定ならサービス一覧を取得する。空き枠は指定日を含む31日以内で確認し、startMinuteをHH:mmに変換して案内する。空き枠は参考値であり、作成結果を確定情報とする。
2. 予約作成前にサービス、日付、時刻を提示し、利用者の明示的な確定意思を得る。個人情報を含まない16〜100文字の識別子を予約意図ごとに1つ生成し、Idempotency-KeyとexternalReferenceIdへ同じ値を渡す。不明な結果の再照会では同じ値を再利用する。
3. 既存予約の確認、変更、取消では、利用者本人が保管する予約IDを受け取り、最初に予約を取得して最新内容とversionを確認する。
4. サービス、日付、時刻を変える場合は先に空き枠を再確認する。変更前後を提示して同意を得た後、一部項目だけなら部分更新、全項目を置換する場合だけ全置換を使う。
5. 取消前に対象予約と取消意思を明示的に確認し、最新versionからIf-Matchを作って取消する。204で本文が空でもエラーがなく、その後の確認が404なら成功として扱う。
6. RESERVATION_PRECONDITION_FAILEDまたは曖昧な更新結果では自動再実行しない。予約を再取得して実状態と差分を説明し、再度同意を得る。RESERVATION_SLOT_FULLでは空き枠を再取得して別候補を案内する。
7. 出力にerrorがある、または非2xxの場合は成功と案内しない。retryableがtrueでも変更系ツールを連打せず、requestIdを障害調査用に保持する。

使用可能なツールは、この指示へ挿入されたツールだけとする。
```

`挿入` → `ツール`から次の7件を各1件追加します。`Custom tool`の最初の一覧に部分更新ツールが表示されない場合は、同セクションの`さらに表示`を押します。

| 種別 | 名前 |
| --- | --- |
| APIコール | `mirai_reservation_list_services` |
| APIコール | `mirai_reservation_get_availability` |
| APIコール | `mirai_reservation_create` |
| APIコール | `mirai_reservation_get` |
| APIコール | `mirai_reservation_replace` |
| APIコール | `mirai_reservation_delete` |
| カスタムスクリプト | `mirai_reservation_update_partial` |

`mirai_reservation_list`はスキルへ追加しません。このAPIは同じAPIキーで作成された予約を一覧化し、会話中の利用者単位には分離しないためです。利用者の予約確認には、利用者本人が保管する予約IDを受け取り、`mirai_reservation_get`を使用します。

この除外はSkill上の抑止であり、server-sideの利用者分離や本人確認ではありません。予約IDの提示だけを本人確認済みと扱わず、公開運用では利用者識別と予約所有者の検証、またはサービス照会と予約一覧の権限分離を別途実装します。

`bulky-waste`は[粗大ごみFAQ](../自治体-基礎自治体-未来市/14.ごみゼロ推進課/03_粗大ごみ_FAQ.md)で、チャットによる予約確定、料金算定、受付番号発行を行わないと案内しています。ナレッジを更新してZoomへ再同期するまでは、サービス・空き枠の案内だけを許可し、作成・変更・取消を実行しません。

保存後、`私のスキル`から開き直し、General、名前、トリガー、指示、7件のツール参照が各1件であることと、`mirai_reservation_list`が0件であることを確認します。

Skill Libraryへの保存だけでは利用者向けAgentへ反映されません。公開前の停止条件を満たした後、対象Agentで`Add from library` → `Use`を選び、スキルを`Active`にしてAgentを`Publish`します。ツールテンプレートまたは共有スキルを後から変更した場合も、影響するAgentの参照内容を確認して再Publishします。

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

2. APIコール7件とカスタムスクリプトを保存後に開き直し、Production URL、静的Authorization、入力、出力を確認します。`localhost`、プレースホルダー、同名出力の重複を残しません。
3. `Debug`は次の順で実行します。

   1. サービス一覧、空き枠、予約一覧を実行します。
   2. 個人情報を含まない検証専用の`Idempotency-Key`と`externalReferenceId`で一時予約を作成します。
   3. 作成結果の予約IDを使用して、詳細取得、完全更新、部分更新を実行します。
   4. 最新versionで予約を削除します。DELETEは`204 No Content`のためDebug結果が空でも正常です。
   5. 削除後の詳細取得が`404 RESERVATION_API_NOT_FOUND`になることと、検証用予約が一覧に残っていないことを確認します。

4. 変更系ツールの結果が不明な場合は自動再実行せず、詳細取得で現在の予約とversionを照合します。
5. エラーは`message`ではなく`error`と`retryable`で分岐します。予約枠満了は`409 RESERVATION_SLOT_FULL`、更新競合は`412`、`If-Match`欠落は`428`、月間上限は`429`として扱います。
6. Skill Libraryの保存後監査を行います。Agentへの追加、Active化、Publishは別の変更として扱います。

## 参考情報

- [予約API OpenAPI](../../development/reservation-api.openapi.json)
- [予約APIのcurl動作確認](../../development/reservation-api-curl.md)
- [Creating Zoom Virtual Agent tools](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0081099)
- [Managing the Skill Library in AI Studio](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0087347)
