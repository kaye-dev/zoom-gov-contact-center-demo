# 予約APIツールテンプレート作成

Zoom Virtual Agent（ZVA）から予約APIを呼び出すツールテンプレートを、APIコール7件とカスタムスクリプト1件の順で作成し、Skill Libraryへ登録します。

この手順は、2026年9月1日に`https://demo.lg.keien.dev`とZoom AI Studioの実画面で確認した8件を、公開音声Agentの発信者番号所有者照合へ対応させるための設定です。予約作成、詳細取得、完全更新、削除は、Zoom AI Studioの変数ピッカーで`global_system.Engagement.ANI`を選び、`X-Reservation-Caller-Phone`へ渡します。バックエンド切替、4件すべてのヘッダー設定、Debug、同一ANIと別ANIの実通話試験が終わるまでは公開しません。

部分更新スクリプトのGET非200明示処理はZoom側へ未適用で、ANIヘッダーの伝播も未確認です。安全修正と再Debugが完了するまでAgentへ追加せず、一部項目の変更も詳細取得、空き枠確認、完全更新で実行します。

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

6. `mirai_reservation_create`、`mirai_reservation_get`、`mirai_reservation_replace`、`mirai_reservation_delete`には、各節に示す`X-Reservation-Caller-Phone`も追加します。値はLLM収集や手動値ではなく、`From Variable`の変数ピッカーから選択する`global_system.Engagement.ANI`です。変数名を手入力せず、発信者番号をBody、Query、URL、`externalReferenceId`へ複製しません。
7. `Virtual Agent`の出力へ各節のレスポンス項目を追加し、タイムアウトを`10`秒にして保存します。

Zoom公式のTool作成記事は同じ発信者番号変数を`global.system.engagement.ani`と表記しますが、2026年9月1日の変数ピッカーと保存後の実画面では`global_system.Engagement.ANI`と表示されました。イベントスクリプトの公式例もunderscore形式を使用しています。本手順では実画面の保存値を正とし、必ずピッカーから選択します。APIは`+`と国番号を含むstrict E.164だけを受け付けます。非通知、空値、形式不正を会話で聞き直した番号へ置き換えません。

`保存`または`保存して追加`を押しただけでは完了と扱いません。モーダルが閉じ、一覧の更新時刻が変わり、開き直した設定にURL、必須ヘッダー、変数mappingが残っていることを保存証拠とします。

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

このツールはAPIキー管理用です。Tool Templatesには保守できますが、Skill Libraryと利用者向けAgentには追加しません。ANIによる利用者単位の予約一覧ではありません。

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
| `X-Reservation-Caller-Phone` | Header | String | はい | From Variable | `global_system.Engagement.ANI`。変数ピッカーから選び、発話から収集、復唱、手動補完しない |
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
| `X-Reservation-Caller-Phone` | Header | String | はい | From Variable | `global_system.Engagement.ANI`。変数ピッカーから選び、作成時と同じANIだけ取得可能 |

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
| `X-Reservation-Caller-Phone` | Header | String | はい | From Variable | `global_system.Engagement.ANI`。変数ピッカーから選び、作成時と同じANIだけ更新可能 |
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
| `X-Reservation-Caller-Phone` | Header | String | はい | From Variable | `global_system.Engagement.ANI`。変数ピッカーから選び、作成時と同じANIだけ削除可能 |

成功時は`204 No Content`のため成功出力を追加しません。共通の異常系出力だけを設定します。

## 8. 予約部分更新

ZoomのAPIコールは`PATCH`を選択できません。また、2026年9月1日に本デモのProduction URLへNode.jsの`fetch`と`https.request`で、それぞれ単一の直接HTTPS PATCHを送信した検証では、クライアントが`412`を受け取った一方、直後のGETではversionが1から2へ進んでいました。同じserver-side実行が更新と`412`の両方を発生させたとは断定できず、transportまたは中継経路での再送、別リクエスト、同時更新の可能性を含めて原因は未特定です。この挙動を正常仕様として扱いません。OpenAPIとローカルのAPI contractはPATCHを引き続き提供しますが、更新済みか不明な状態で再実行すると意図しない変更につながるため、Zoomのカスタムスクリプトでは予約をGETし、未指定項目をマージしてPUTする方式を使用します。

このカスタムスクリプトは、GETとPUTの両方へ`X-Reservation-Caller-Phone`を安全に渡す修正が完了していません。以下は既知の未適用実装として保守しますが、Tool TemplateのDebug、Skillへの追加、Agentからの実行は行いません。現行Agentでは`mirai_reservation_get`、必要な場合の`mirai_reservation_get_availability`、`mirai_reservation_replace`を使用します。

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

次の条件を一つでも満たさない場合は、予約スキルを公開Agentへ反映しません。公開中のAgentを編集する場合は、検証中の版をドラフトに保ちます。

- ANI所有者照合を含む予約APIとデータベース移行がProductionへ反映されている。
- `mirai_reservation_create`、`mirai_reservation_get`、`mirai_reservation_replace`、`mirai_reservation_delete`の`X-Reservation-Caller-Phone`が、`From Variable`の`global_system.Engagement.ANI`として保存され、開き直しても保持されている。
- 4件が有効なE.164テストANIでDebugに成功し、欠落と形式不正を400で拒否する。
- 同一ANIの作成、取得、変更、取消と、別ANIによる同じ予約IDへのアクセス拒否を実通話で確認した。
- AgentとSkillに`mirai_reservation_list`と`mirai_reservation_update_partial`が追加されていない。
- 粗大ごみを日付だけのデモ予約として扱い、品目、大きさ、数量、住所、排出場所を質問、収集、記録せず、料金、処理券、正式受付番号、行政申請完了を確定しない指示が反映されている。

ANIは発信者番号の連続性を使うデモ用の所有者境界であり、強い本人確認ではありません。番号の不正な表示や電話番号の再割当てなどを排除できないため、行政手続きの本番運用ではOTPなどの追加認証を設計します。

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
- 公開音声Agentでは、発信者番号がglobal_system.Engagement.ANIからX-Reservation-Caller-Phoneへ渡され、API側のANI所有者照合が有効な場合だけ、予約の詳細取得、作成、変更、取消を実行する。
- 発信者番号を利用者へ質問、復唱、表示しない。発話された番号、推測値、別の変数でglobal_system.Engagement.ANIを置き換えない。
- 発信者番号が非通知、空、E.164形式以外、作成時と不一致、または所有者情報のない旧予約の場合は、予約の存在や内容を明かさず「この通話では予約を確認できません」と案内する。
- ANIはデモ用の継続性境界であり、本人確認済み、行政上の本人認証済みとは案内しない。
- serviceKeyを推測しない。未確定ならサービス一覧を取得して利用者に確認する。
- 予約一覧ツールはAPIキー管理用で発信者単位に分離されていないため、このスキルでは絶対に使用しない。他の利用者の予約を検索、列挙、推測しない。
- serviceKeyがbulky-wasteの場合も、日付と空き状況だけのデモ予約記録は作成、確認、変更、取消できる。このデモでは品目、大きさ、数量、住所、排出場所を質問、収集、記録せず、料金算定、処理券発行、正式受付番号発行、行政上の収集申込み完了とは案内しない。正式申込み手順を質問された場合は、FAQに基づいて利用者自身が確認する事項として案内するだけにする。
- Authorization、APIキー、Idempotency-Key、externalReferenceId、X-Reservation-Caller-Phoneを利用者へ表示しない。APIにない本人確認、審査、料金、通知の完了を確定したと案内しない。
- 部分更新ツールは使用しない。一部項目だけを変更する場合も、詳細取得、空き枠確認、完全更新を使用する。

操作手順
1. サービスが未確定ならサービス一覧を取得する。空き枠は指定日を含む31日以内で確認し、startMinuteをHH:mmに変換して案内する。空き枠は参考値であり、作成結果を確定情報とする。
2. 予約作成前にサービス、日付、時刻を提示し、利用者の明示的な確定意思を得る。bulky-wasteの時刻は日付予約を表す00:00として内部で扱い、時刻指定とは案内しない。個人情報を含まない16〜100文字の識別子を予約意図ごとに1つ生成し、Idempotency-KeyとexternalReferenceIdへ同じ値を渡す。不明な結果の再照会では同じ値を再利用する。
3. 既存予約の確認、変更、取消では、利用者が保管する予約IDを受け取り、最初に予約を取得して最新内容とversionを確認する。予約IDだけで所有者確認済みとは扱わず、APIのANI照合結果に従う。
4. サービス、日付、時刻を変える場合は先に空き枠を再確認する。変更前後を提示して同意を得た後、現在値と変更値をまとめて完全更新する。
5. 取消前に対象予約と取消意思を明示的に確認し、最新versionからIf-Matchを作って取消する。204で本文が空でもエラーがなく、その後の確認が404なら成功として扱う。
6. RESERVATION_CALLER_PHONE_REQUIREDまたはRESERVATION_CALLER_PHONE_INVALIDでは予約操作を停止し、番号を聞き取って補完しない。404では存在しない予約、別ANI、所有者情報のない旧予約を区別して説明しない。
7. RESERVATION_PRECONDITION_FAILEDまたは曖昧な更新結果では自動再実行しない。予約を再取得して実状態と差分を説明し、再度同意を得る。RESERVATION_SLOT_FULLでは空き枠を再取得して別候補を案内する。
8. 出力にerrorがある、または非2xxの場合は成功と案内しない。retryableがtrueでも変更系ツールを連打せず、requestIdを障害調査用に保持する。

使用可能なツールは、この指示へ挿入されたツールだけとする。
```

`挿入` → `ツール`から次の6件を各1件追加します。

| 種別 | 名前 |
| --- | --- |
| APIコール | `mirai_reservation_list_services` |
| APIコール | `mirai_reservation_get_availability` |
| APIコール | `mirai_reservation_create` |
| APIコール | `mirai_reservation_get` |
| APIコール | `mirai_reservation_replace` |
| APIコール | `mirai_reservation_delete` |

`mirai_reservation_list`はスキルへ追加しません。このAPIは同じAPIキーで作成された予約を一覧化する管理機能で、発信者単位には分離しないためです。利用者の予約確認には、利用者が保管する予約IDを受け取り、`mirai_reservation_get`を使用します。

`mirai_reservation_update_partial`も追加しません。GET非200分岐とANIヘッダー伝播を修正し、保存後の読み戻し、正常系、同一ANI、別ANI、404を再Debugするまで未使用にします。

`X-Reservation-Caller-Phone`は予約APIがserver-sideで検証するための入力で、レスポンス、会話、予約一覧、ログへ返しません。APIはAPIキーを鍵にANIをHMAC-SHA-256で不可逆なdigestへ変換し、raw番号を予約レコードへ保存しません。詳細は[予約API発信者番号所有者照合](./06_予約API発信者番号所有者照合.md)を確認します。

保存後、`私のスキル`から開き直し、General、名前、トリガー、指示、6件のツール参照が各1件であることと、`mirai_reservation_list`と`mirai_reservation_update_partial`が0件であることを確認します。

Skill Libraryへの保存だけでは利用者向けAgentへ反映されません。公開前の停止条件を満たした後、対象Agentで`Add from library` → `Use`を選び、スキルを`Active`にします。ツールテンプレートまたは共有スキルを後から変更した場合も、影響するAgentの参照内容を確認してからPublishします。

2026年9月1日の対象音声Agentでは、Generalスキルの`Use`が`skill.channel=3 incompatible with agent.channel=2`で失敗しました。Zoom公式手順はカスタムスキルのモダリティとしてGeneral、Voice、Chatを案内していますが、この内部チャネル番号の対応関係は公開していません。同じエラーが発生した場合は追加を停止し、資格情報やモダリティを推測で変更せず、[音声ボット作成](./02_音声ボット作成.md#予約対応を音声agentへ追加する)の手順で対象Agent内にローカルスキルを作成します。

Agentローカル版では`スキルライブラリに追加`をオフにし、同じ指示と6件のツール参照を設定します。各ツールの`ツールの確認と追加`に表示される保存済みの静的Authorizationは外部へ表示、コピー、変更せず、同一アカウントの承認済み設定であることを確認して`保存して追加`を実行します。Skill Library版とAgentローカル版は別管理のため、一方の変更が他方へ自動同期されたと扱いません。

Tool Templateを更新しても、既存Agent内の同名ツールは更新されません。同名の新テンプレートを旧コピーと同じ保存操作で追加すると重複エラーになるため、最初にAgentローカルスキルから作成、詳細取得、完全更新、削除の旧4件を外し、サービス一覧と空き枠取得だけの中間状態を保存します。次に開き直して最新テンプレートの4件を再追加し、6件すべてを保存後に読み戻します。Agent guidanceとSkill Library版も別々に保存、監査し、Production検証完了後にAgentを再Publishします。

Agent guidanceだけでは権限制御になりません。公開判断は、APIのANI照合と4件のヘッダー設定を実通話で検証した結果に基づきます。未完了の場合は、予約スキルを無効化し、`mirai_reservation_list_services`と`mirai_reservation_get_availability`だけを参照するread-onlyスキルへ戻します。

## 確認

Agentの`テストを開始`で実会話を確認する場合は、[予約デモのトーク例](./05_予約デモトーク例.md)を使用します。

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

2. APIコール7件とカスタムスクリプトを保存後に開き直し、Production URL、静的Authorization、入力、出力を確認します。`localhost`、プレースホルダー、同名出力の重複を残しません。作成、詳細取得、完全更新、削除の`X-Reservation-Caller-Phone`は、4件すべてが`From Variable`の`global_system.Engagement.ANI`であることを個別に読み戻します。
3. `Debug`は次の順で実行します。

   1. サービス一覧、空き枠、予約一覧を実行します。
   2. 管理者が管理するstrict E.164の`〈テストANI-A〉`を設定します。Tool Debugが`From Variable`のテスト値注入に対応する場合は、保存済みmappingを手動値へ変更せずDebug入力から設定します。対応しない場合はAgent Previewの`Start test with variables`で、画面に表示される`global_system.Engagement.ANI`へ設定し、Tool実行結果を確認します。実利用者の番号をテストケース名、文書、スクリーンショット、チャットへ記録しません。
   3. 個人情報を含まない検証専用の`Idempotency-Key`と`externalReferenceId`で一時予約を作成します。
   4. 作成結果の予約IDと同じ`〈テストANI-A〉`を使用して、詳細取得と完全更新を実行します。
   5. 同じ予約IDを別の`〈テストANI-B〉`で取得し、`404 RESERVATION_API_NOT_FOUND`になり、予約内容、所有者照合結果、件数が返らないことを確認します。
   6. `〈テストANI-A〉`で得た最新versionとstrong `If-Match`を使い、`〈テストANI-B〉`で完全更新を実行します。404になり、その後に`〈テストANI-A〉`で取得した予約内容とversionが変わっていないことを確認します。
   7. 同じstrong `If-Match`を使い、`〈テストANI-B〉`で削除を実行します。404になり、その後も`〈テストANI-A〉`で予約を取得でき、内容とversionが変わっていないことを確認します。
   8. `〈テストANI-A〉`へ戻し、最新versionで予約を削除します。DELETEは`204 No Content`のためDebug結果が空でも正常です。
   9. 削除後の詳細取得が`404 RESERVATION_API_NOT_FOUND`になることと、検証用予約が管理用一覧に残っていないことを確認します。
   10. 欠落値は`400 RESERVATION_CALLER_PHONE_REQUIRED`、E.164以外は`400 RESERVATION_CALLER_PHONE_INVALID`になることを確認します。Agentには番号を聞き取って再試行させません。
   11. 部分更新は、GET非200安全分岐とANIヘッダー伝播をZoom側へ反映し、保存後に開き直して反映を確認するまでDebugしません。正常系、同一ANI、別ANI、存在しない予約IDの再Debugが完了するまではSkillへ追加しません。

4. 変更系ツールの結果が不明な場合は自動再実行せず、詳細取得で現在の予約とversionを照合します。
5. エラーは`message`ではなく`error`と`retryable`で分岐します。発信者番号の欠落・形式不正は`400`、予約が存在しない、別ANI、所有者情報のない旧予約は区別せず`404`、予約枠満了は`409 RESERVATION_SLOT_FULL`、更新競合は`412`、`If-Match`欠落は`428`、月間上限は`429`として扱います。
6. Skill LibraryとAgentローカル版の保存後監査を別々に行います。Agentローカル版は最新テンプレートの4件を再追加した後、6件のツール参照を開き直します。Agent guidance、公開前の停止条件を満たした後に再Publishし、公開音声チャネルで同一ANIと別ANIの実通話試験を行います。Previewだけの成功はANI自動連携の証拠にしません。

## 参考情報

- [予約API OpenAPI](../../development/reservation-api.openapi.json)
- [予約APIのcurl動作確認](../../development/reservation-api-curl.md)
- [予約API発信者番号所有者照合](./06_予約API発信者番号所有者照合.md)
- [Creating Zoom Virtual Agent tools](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0081099)
- [Testing a voice or chat agent in Zoom Virtual Agent](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0081098)
- [Managing global custom and system variables for Zoom Virtual Agent](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058251)
- [Using the Profile tab for Zoom Contact Center](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059477)
- [Managing the Skill Library in AI Studio](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0087347)
