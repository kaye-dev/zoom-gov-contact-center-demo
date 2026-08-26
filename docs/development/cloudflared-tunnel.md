# Cloudflare Tunnel

公開ホスト名は`demo.keien.dev`、トンネル名は`zoomineer`（ID: `3f536d7d-2d28-4f4f-8e9d-657a4923d596`）を使う。

複数の端末で同じホスト名を使い回すと、DNSのCNAMEが後から設定した端末のトンネルへ上書きされ、
起動していない側のトンネルへルーティングされて`Error 1033`（Cloudflare Tunnel error）になる。
端末ごとにホスト名を分けること。

## 1. 初回設定

### 1.1 `cloudflared`をセットアップする

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create zoomineer
cloudflared tunnel list
```

### 1.2 `~/.cloudflared/config.yml`を作成する

```yaml
tunnel: zoomineer
credentials-file: ~/.cloudflared/3f536d7d-2d28-4f4f-8e9d-657a4923d596.json

ingress:
  - hostname: demo.keien.dev
    service: http://127.0.0.1:3000
  - service: http_status:404
```

```bash
chmod 600 ~/.cloudflared/config.yml
chmod 600 ~/.cloudflared/3f536d7d-2d28-4f4f-8e9d-657a4923d596.json
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://demo.keien.dev
```

### 1.3 Cloudflare Accessを設定する

1. `Cloudflare Zero Trust` → `Access controls` → `Applications`を開く。
2. `Create new application` → `Self-hosted and private` → `Add public hostname`を選ぶ。
3. Hostnameへ`demo.keien.dev`を入力する。
4. Policy actionで`Allow`を選ぶ。
5. Includeで`Emails`を選び、デモ参加者のメールアドレスを追加する。
6. One-time PINを有効にして保存する。

### 1.4 DNSを設定する

```bash
cloudflared tunnel route dns zoomineer demo.keien.dev
dig @1.1.1.1 demo.keien.dev
```

## 2. デモを開始する

### 2.1 Cloudflare Accessへ参加者を追加する

1. `Cloudflare Zero Trust` → `Access controls` → `Applications`を開く。
2. `demo.keien.dev`のAllow policyへ参加者のメールアドレスを追加する。

### 2.2 Webを起動する

```bash
./dev-compose.sh up -d --build web
```

`3`を入力する。

```text
Web access:
  1) This Mac only: http://localhost:3000 (default)
  2) Same network: http://192.168.x.x:3000
  3) Cloudflare Tunnel: https://demo.keien.dev
Select [1/2/3]: 3
```

```bash
docker compose exec -T web printenv BETTER_AUTH_URL
docker compose exec -T web printenv BETTER_AUTH_TRUSTED_ORIGINS
docker compose exec -T web printenv NEXT_ALLOWED_DEV_ORIGIN
curl -fsS http://127.0.0.1:3000/api/health
```

```text
https://demo.keien.dev
https://demo.keien.dev
demo.keien.dev
```

### 2.3 Tunnelを起動する

別のターミナルで実行する。

```bash
cloudflared tunnel run zoomineer
```

### 2.4 ブラウザで開く

```text
https://demo.keien.dev
```

## 3. デモを終了する

1. `cloudflared tunnel run`を実行したターミナルで`Ctrl+C`を押す。
2. 次を実行する。

```bash
./dev-compose.sh down
```

3. Cloudflare AccessのAllow policyから参加者のメールアドレスを削除する。

## 4. トラブルシューティング

### `Error 1033` が出る

DNSが指すトンネルIDと、いま起動しているトンネルのIDが一致しているかを確認する。

```bash
cloudflared tunnel list
cloudflared tunnel info zoomineer
```

DNSを現在のトンネルへ張り替える。

```bash
cloudflared tunnel route dns --overwrite-dns zoomineer demo.keien.dev
```
