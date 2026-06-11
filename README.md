# 市区町村デモサイト（Zoom 製品デモ用）

Zoom 製品のデモ用に作成した、架空の市区町村ホームページのデモサイトです。

自治体の窓口を想定し、ホームページ上から以下の Zoom 製品の動線を体験できることを目的としています。

- **Zoom Virtual Agent** — HP 上にチャットボットを配置し、住民からの問い合わせに自動応答するデモ
- **Zoom Contact Center / Zoom Phone** — Virtual Agent からの有人対応へのエスカレーション、および HP に掲載した電話番号からの着信デモ

## 技術スタック

- [Next.js](https://nextjs.org) 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- 多言語対応（i18n）/ ダークモード対応

## セットアップ

開発サーバーを起動します。

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開くと表示されます。

## スクリプト

| コマンド | 説明 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 本番ビルドを作成 |
| `npm run start` | 本番サーバーを起動 |
| `npm run lint` | ESLint を実行 |

## ディレクトリ構成

```
app/
├── page.tsx           # トップページ
├── layout.tsx         # 共通レイアウト
├── components/        # ヘッダー / フッター / 言語切替 / テーマ切替 など
└── i18n/              # 多言語対応（辞書・Provider）
```
