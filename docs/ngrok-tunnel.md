# ngrok無料枠

## 1. 初回設定

1. [ngrok Dashboard](https://dashboard.ngrok.com/signup)で無料アカウントを作成する。
2. Dashboardで`Authtoken`と割り当て済みのDev Domainを確認する。`*.ngrok-free.app`と`*.ngrok-free.dev`の両方に対応する。
3. 次を実行する。

```bash
brew install ngrok
read -s "NGROK_AUTHTOKEN?Authtoken: "
echo
ngrok config add-authtoken "$NGROK_AUTHTOKEN"
unset NGROK_AUTHTOKEN
ngrok config check
```

## 2. Basic Authを設定する

```bash
mkdir -p ~/.config/ngrok
chmod 700 ~/.config/ngrok
openssl rand -base64 24
```

`~/.config/ngrok/zoom-gov-demo-basic-auth.yml`を作成し、生成したパスワードを設定する。

```yaml
on_http_request:
  - actions:
      - type: basic-auth
        config:
          credentials:
            - "demo:<生成した一時パスワード>"
```

```bash
chmod 600 ~/.config/ngrok/zoom-gov-demo-basic-auth.yml
```

## 3. デモを開始する

### 3.1 Webを起動する

```bash
export HOST_PORT=3000
export NGROK_DOMAIN='your-assigned-name.ngrok-free.dev'
./dev-compose.sh up -d --build web
```

`4`を入力する。

```text
Web access:
  1) This Mac only: http://localhost:3000 (default)
  2) Same network: http://192.168.x.x:3000
  3) Cloudflare Tunnel: https://zoom.keien.dev
  4) ngrok Free: assigned Dev Domain
Select [1/2/3/4]: 4
```

```bash
docker compose exec -T web printenv BETTER_AUTH_URL
docker compose exec -T web printenv BETTER_AUTH_TRUSTED_ORIGINS
docker compose exec -T web printenv NEXT_ALLOWED_DEV_ORIGIN
curl -fsS "http://127.0.0.1:${HOST_PORT}/api/health"
```

### 3.2 ngrokを起動する

別のターミナルで実行する。

```bash
ngrok http "${HOST_PORT}" \
  --traffic-policy-file "$HOME/.config/ngrok/zoom-gov-demo-basic-auth.yml"
```

### 3.3 ブラウザで開く

```text
https://your-assigned-name.ngrok-free.dev
```

1. ngrokの案内画面で`Visit`を押す。
2. Basic Authへユーザー名`demo`と一時パスワードを入力する。

## 4. デモを終了する

1. `ngrok http`を実行したターミナルで`Ctrl+C`を押す。
2. 次を実行する。

```bash
./dev-compose.sh down
unset HOST_PORT NGROK_DOMAIN
```

3. 一時パスワードを変更する。

## 5. 無料枠

| 項目 | 上限 |
| --- | --- |
| Dev Domain | 自動割り当て1個 |
| Online Endpoint | 最大3個 |
| HTTPリクエスト | 月20,000件 |
| 送信データ | 月1 GB |
| HTTPリクエストレート | 毎分4,000件 |

- Endpointの時間制限なし。
- 任意のサブドメイン、独自ドメイン、ランダムURLは利用不可。
- HTMLアクセスではngrokの案内画面が表示される。
- 使用量は[Usage Dashboard](https://dashboard.ngrok.com/usage)で確認する。
