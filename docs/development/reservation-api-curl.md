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

command -v curl jq
curl -fsS "$BASE_URL/api/health" | jq .
```

## 1. 予約を登録する

```bash
CREATE_RESPONSE="$(curl -sS -X POST "$BASE_URL/api/public/v1/reservations" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"serviceKey\":\"civic-facility\",\"reservationDate\":\"$RESERVATION_DATE\",\"startMinute\":540}")"

printf '%s\n' "$CREATE_RESPONSE" | jq .
export RESERVATION_ID="$(printf '%s\n' "$CREATE_RESPONSE" | jq -er '.reservation.id')"
```

## 2. 登録した予約を取得する

```bash
curl -sS "$BASE_URL/api/public/v1/reservations/$RESERVATION_ID" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

## 3. 予約時間を変更する

```bash
curl -sS -X PATCH "$BASE_URL/api/public/v1/reservations/$RESERVATION_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"startMinute":780}' | jq .
```

## 4. 一覧から確認する

```bash
curl -sS --get "$BASE_URL/api/public/v1/reservations" \
  -H "Authorization: Bearer $API_KEY" \
  --data-urlencode 'serviceKey=civic-facility' \
  --data-urlencode "dateFrom=$RESERVATION_DATE" \
  --data-urlencode "dateTo=$RESERVATION_DATE" \
  --data-urlencode 'limit=10' | jq .
```

## 5. 予約を削除する

`HTTP 204` が表示されれば成功です。

```bash
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' \
  -X DELETE "$BASE_URL/api/public/v1/reservations/$RESERVATION_ID" \
  -H "Authorization: Bearer $API_KEY"
```

削除後は `RESERVATION_API_NOT_FOUND` が返ります。

```bash
curl -sS "$BASE_URL/api/public/v1/reservations/$RESERVATION_ID" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

APIリクエストの記録は[API利用ログ](http://localhost:3000/admin/reservations/api-keys/logs)で確認できます。
