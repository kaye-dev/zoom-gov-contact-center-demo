# 予約APIのcurl動作確認

## 準備

リポジトリルートでアプリを起動し、アクセス範囲は `1` を選びます。

```bash
./dev-compose.sh
```

[予約APIキー管理](http://localhost:3000/admin/reservations/api-keys)でAPIキーを発行し、`LIST`、`READ`、`CREATE`、`UPDATE`、`DELETE`を付与します。発行直後だけ表示されるAPIキーをコピーして、次を実行します。

```bash
export BASE_URL='http://localhost:3000'
export API_KEY='ここに発行したAPIキーを貼り付ける'
export RESERVATION_DATE="$(node -e "const d=new Date();d.setUTCDate(d.getUTCDate()+7);console.log(d.toISOString().slice(0,10))")"
export EXTERNAL_REFERENCE_ID="zva_$(node -e "console.log(crypto.randomUUID().replaceAll('-',''))")"
export IDEMPOTENCY_KEY="zva_$(node -e "console.log(crypto.randomUUID().replaceAll('-',''))")"
export RESPONSE_HEADERS="$(mktemp)"

command -v curl jq
curl -fsS "$BASE_URL/api/health" | jq .
```

API contractの正本は [reservation-api.openapi.json](./reservation-api.openapi.json) です。すべての公開API responseは `X-Request-ID` を返し、JSON bodyがある場合は同じ値を `requestId` に返します。

## 1. サービスと空き枠を確認する

サービス一覧には予約方法、曜日、開始時刻、所要時間、定員が含まれます。

```bash
curl -sS "$BASE_URL/api/public/v1/reservation-services" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

空き枠は取得時点の参考値です。`capacity`、`booked`、`remaining`、`status`を確認できますが、予約可否は次のPOSTで最終判定されます。

```bash
curl -sS --get \
  "$BASE_URL/api/public/v1/reservation-services/civic-facility/availability" \
  -H "Authorization: Bearer $API_KEY" \
  --data-urlencode "dateFrom=$RESERVATION_DATE" \
  --data-urlencode "dateTo=$RESERVATION_DATE" | jq .
```

## 2. 予約を登録する

`Idempotency-Key`と`externalReferenceId`は16〜100文字の不透明な英数字・`_`・`-`にし、電話番号やメールアドレスなどの個人情報を入れません。

```bash
CREATE_RESPONSE="$(curl -sS -D "$RESPONSE_HEADERS" \
  -X POST "$BASE_URL/api/public/v1/reservations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"serviceKey\":\"civic-facility\",\"reservationDate\":\"$RESERVATION_DATE\",\"startMinute\":540,\"externalReferenceId\":\"$EXTERNAL_REFERENCE_ID\"}")"

printf '%s\n' "$CREATE_RESPONSE" | jq .
export RESERVATION_ID="$(printf '%s\n' "$CREATE_RESPONSE" | jq -er '.reservation.id')"
export RESERVATION_ETAG="$(awk 'BEGIN{IGNORECASE=1} /^etag:/ {sub(/^[^:]+:[[:space:]]*/,""); sub(/\r$/,""); print}' "$RESPONSE_HEADERS")"
awk 'BEGIN{IGNORECASE=1} /^(location|etag|x-request-id):/' "$RESPONSE_HEADERS"
```

成功時は `201`、`Location`、version付きのstrong `ETag`を返します。同じAPIキー、`Idempotency-Key`、payloadで再送すると予約を増やさず、同じ予約・`Location`・`ETag`を201で返します。HTTP requestごとの `requestId` と利用ログは新しくなります。

```bash
curl -sS -D - \
  -X POST "$BASE_URL/api/public/v1/reservations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"serviceKey\":\"civic-facility\",\"reservationDate\":\"$RESERVATION_DATE\",\"startMinute\":540,\"externalReferenceId\":\"$EXTERNAL_REFERENCE_ID\"}"
```

同じ `Idempotency-Key` を異なるpayloadで使うと `409 RESERVATION_IDEMPOTENCY_KEY_REUSED`、同じ `externalReferenceId` を別の `Idempotency-Key` で使うと `409 RESERVATION_EXTERNAL_REFERENCE_CONFLICT` です。

## 3. 登録した予約を取得する

```bash
curl -sS -D "$RESPONSE_HEADERS" \
  "$BASE_URL/api/public/v1/reservations/$RESERVATION_ID" \
  -H "Authorization: Bearer $API_KEY" | jq .

export RESERVATION_ETAG="$(awk 'BEGIN{IGNORECASE=1} /^etag:/ {sub(/^[^:]+:[[:space:]]*/,""); sub(/\r$/,""); print}' "$RESPONSE_HEADERS")"
```

予約LIST/READ/PUT/PATCH/DELETEは、その予約を作成したAPIキーにだけ公開されます。別のAPIキーからは `404` です。

## 4. 予約を完全置換する

ZVAからの主な更新にはPUTを使います。直前のCREATE/GET/PUT/PATCHで取得したETagを `If-Match` に指定します。

```bash
REPLACE_RESPONSE="$(curl -sS -D "$RESPONSE_HEADERS" \
  -X PUT "$BASE_URL/api/public/v1/reservations/$RESERVATION_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "If-Match: $RESERVATION_ETAG" \
  -H 'Content-Type: application/json' \
  -d "{\"serviceKey\":\"civic-facility\",\"reservationDate\":\"$RESERVATION_DATE\",\"startMinute\":780,\"externalReferenceId\":\"$EXTERNAL_REFERENCE_ID\"}")"

printf '%s\n' "$REPLACE_RESPONSE" | jq .
export RESERVATION_ETAG="$(awk 'BEGIN{IGNORECASE=1} /^etag:/ {sub(/^[^:]+:[[:space:]]*/,""); sub(/\r$/,""); print}' "$RESPONSE_HEADERS")"
```

`If-Match`欠落は `428 RESERVATION_PRECONDITION_REQUIRED`、古いETagは `412 RESERVATION_PRECONDITION_FAILED` です。

## 5. 予約を部分更新する

既存の直接連携ではPATCHも使用できます。

```bash
curl -sS -D "$RESPONSE_HEADERS" \
  -X PATCH "$BASE_URL/api/public/v1/reservations/$RESERVATION_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "If-Match: $RESERVATION_ETAG" \
  -H 'Content-Type: application/json' \
  -d '{"startMinute":540}' | jq .

export RESERVATION_ETAG="$(awk 'BEGIN{IGNORECASE=1} /^etag:/ {sub(/^[^:]+:[[:space:]]*/,""); sub(/\r$/,""); print}' "$RESPONSE_HEADERS")"
```

## 6. 一覧から確認する

```bash
curl -sS --get "$BASE_URL/api/public/v1/reservations" \
  -H "Authorization: Bearer $API_KEY" \
  --data-urlencode 'serviceKey=civic-facility' \
  --data-urlencode "dateFrom=$RESERVATION_DATE" \
  --data-urlencode "dateTo=$RESERVATION_DATE" \
  --data-urlencode 'limit=10' | jq .
```

## 7. 予約を削除する

`HTTP 204` が表示されれば成功です。204にはbodyがなく、`X-Request-ID`はheaderで確認します。

```bash
curl -sS -D - -o /dev/null -w 'HTTP %{http_code}\n' \
  -X DELETE "$BASE_URL/api/public/v1/reservations/$RESERVATION_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "If-Match: $RESERVATION_ETAG"
```

## エラー分岐

JSON errorは `error`、`message`、`retryable`、`requestId` を返します。ZVAは `message` の文言ではなく `error` と `retryable` で分岐します。

- `409 RESERVATION_SLOT_FULL` は `retryable: false` で要求枠と `availabilityPath` を返し、`Retry-After` は返しません。
- `429` は自治体全体またはAPIキーごとの月間上限で、`retryable: true` と `Retry-After` を返します。
- `500 RESERVATION_API_INTERNAL_ERROR` は内部情報を含めず、`retryable: true` です。
- `415 RESERVATION_API_UNSUPPORTED_MEDIA_TYPE` はPOST/PUT/PATCHの `Content-Type` が `application/json` でない場合です。

実行結果は[API利用ログ](http://localhost:3000/admin/reservations/api-keys/logs)で確認できます。raw APIキー、`Authorization`、`Idempotency-Key`、未解析bodyは保存されません。
