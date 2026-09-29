# super-light-shopping-list

古いタブレットでも軽く動く、スマホと同期する買い物リスト（PWA）。
Cloudflare Workers + D1 で動き、家族用なら無料枠に収まる規模。

## ローカルで動かす

```bash
npm install
cp api/.dev.vars.example api/.dev.vars
npm run db:migrate:local -w api
npm run dev:api     # ターミナル1
npm run dev:web     # ターミナル2 → http://localhost:5173/?token=dev-token-change-me&list=family
```

## 本番にデプロイする（初回）

```bash
cd api
npx wrangler login
npx wrangler d1 create shopping-list
#  → 出力された database_id を api/wrangler.jsonc に書き込む
npx wrangler d1 migrations apply shopping-list --remote
openssl rand -base64 32 | tr -d '=+/'     # トークンを生成
npx wrangler secret put API_TOKEN         # 生成したトークンを貼り付け
cd ..
npm run deploy
```

デプロイ後、タブレットとスマホで次の URL を開き、ホーム画面に追加する。

```
https://super-light-shopping-list.<your-subdomain>.workers.dev/?token=<API_TOKEN>&list=family
```

## タブレットを常時表示にする

- Android: 開発者オプション →「スリープモードにしない（充電中）」をオン
- iPad: 設定 → 画面表示と明るさ → 自動ロック「なし」。アクセスガイドで画面を固定すると誤操作も防げる

設計の詳細は [CLAUDE.md](./CLAUDE.md) を参照。
