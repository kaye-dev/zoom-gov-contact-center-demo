# Cloudflare Tunnel

## 1. 初回設定

### 1.1 `cloudflared`をセットアップする

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create zoom-gov-contact-center-demo
cloudflared tunnel list
```

### 1.2 `~/.cloudflared/config.yml`を作成する

```yaml
tunnel: 323f1e5d-497e-49b1-b946-bac129e5a7fd
credentials-file: ~/.cloudflared/323f1e5d-497e-49b1-b946-bac129e5a7fd.json

ingress:
  - hostname: zoom.keien.dev
    service: http://127.0.0.1:3000
  - service: http_status:404
```

```bash
chmod 600 ~/.cloudflared/config.yml
chmod 600 ~/.cloudflared/323f1e5d-497e-49b1-b946-bac129e5a7fd.json
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://zoom.keien.dev
```

### 1.3 Cloudflare Accessを設定する

1. `Cloudflare Zero Trust` → `Access controls` → `Applications`を開く。
2. `Create new application` → `Self-hosted and private` → `Add public hostname`を選ぶ。
3. Hostnameへ`zoom.keien.dev`を入力する。
4. Policy actionで`Allow`を選ぶ。
5. Includeで`Emails`を選び、デモ参加者のメールアドレスを追加する。
6. One-time PINを有効にして保存する。

### 1.4 DNSを設定する

```bash
cloudflared tunnel route dns zoom-gov-contact-center-demo zoom.keien.dev
dig @1.1.1.1 zoom.keien.dev
```

## 2. デモを開始する

### 2.1 Cloudflare Accessへ参加者を追加する

1. `Cloudflare Zero Trust` → `Access controls` → `Applications`を開く。
2. `zoom.keien.dev`のAllow policyへ参加者のメールアドレスを追加する。

### 2.2 Webを起動する

```bash
./dev-compose.sh up -d --build web
```

`3`を入力する。

```text
Web access:
  1) This Mac only: http://localhost:3000 (default)
  2) Same network: http://192.168.x.x:3000
  3) Cloudflare Tunnel: https://zoom.keien.dev
  4) ngrok Free: assigned *.ngrok-free.app domain
Select [1/2/3/4]: 3
```

```bash
docker compose exec -T web printenv BETTER_AUTH_URL
docker compose exec -T web printenv BETTER_AUTH_TRUSTED_ORIGINS
docker compose exec -T web printenv NEXT_ALLOWED_DEV_ORIGIN
curl -fsS http://127.0.0.1:3000/api/health
```

```text
https://zoom.keien.dev
https://zoom.keien.dev
zoom.keien.dev
```

### 2.3 Tunnelを起動する

別のターミナルで実行する。

```bash
cloudflared tunnel run zoom-gov-contact-center-demo
```

### 2.4 ブラウザで開く

```text
https://zoom.keien.dev
```

## 3. デモを終了する

1. `cloudflared tunnel run`を実行したターミナルで`Ctrl+C`を押す。
2. 次を実行する。

```bash
./dev-compose.sh down
```

3. Cloudflare AccessのAllow policyから参加者のメールアドレスを削除する。
