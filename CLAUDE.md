# CLAUDE.md

家の古いタブレットに常時表示する買い物リストアプリ。スマホと同期する。
このファイルは Claude Code 向けの前提・設計判断のまとめ。実装を変えたら更新すること。

## ユースケース

- 家の古いタブレットで項目を入力 → 外出先のスマホで確認 → スマホかタブレットで DONE にする
- タブレットは据え置きで常時表示（クリーム色の明るい配色、大きな文字、大きなタップ領域）
- 当面は家族用。将来の一般公開も視野に入れる（下の「ロードマップ」参照）

## 構成

```
api/     Cloudflare Workers + Hono + D1。web/dist の静的配信も同じ Worker で行う（同一オリジン、CORS不要）
web/     素の TypeScript + Vite の PWA（フレームワークなし、ビルド後 JS ~10KB）
shared/  API とフロントで共有する型（types.ts）
```

- API: `POST /api/lists/:listId/sync` の1本だけ（＋ `GET /api/health`）
  - 未送信の変更 `changes` を送り、`since` 以降のサーバー側変更を受け取る。1往復で送受信
- 認証: 家族用の共有トークン（`Authorization: Bearer <API_TOKEN>`）。Worker の secret に置く
- フロントの初期設定: `https://<host>/?token=...&list=family` で開くと localStorage に保存し、URL からトークンを消す

## 同期の設計（変更時は必ず守る）

- **ID はクライアント生成の UUID v4**（`web/src/id.ts`。`crypto.randomUUID` が無い古いブラウザ用のフォールバックあり）
- **競合解決は項目単位の Last-Write-Wins**。`updatedAt`（クライアント時計）が大きい方が勝つ
  - サーバー: `ON CONFLICT ... WHERE excluded.updated_at > items.updated_at`
  - クライアント: 端末の時計が巻き戻っても負けないよう、更新時は `max(now, prev.updatedAt + 1)`
- **差分同期のカーソルはサーバー時計**（`server_ts`）。クライアント時計のずれの影響を受けない
  - サーバーは取りこぼし防止のため `serverTime` を 10 秒巻き戻して返す。クライアントのマージは冪等なので重複は無害
- **削除は論理削除**（`deleted`）。物理削除すると他端末から復活するため
  - 初回同期（since=0）では削除済みを返さない
  - クライアントは、削除済みかつ送信済みの項目をローカルから取り除く
- **オフライン対応**: 変更は即ローカル反映＋`pending`（未送信キュー）に積み、通信できたら送る。状態は localStorage に保存
- 同期のタイミング: 変更の 300ms 後 / 表示中は 15 秒ごとにポーリング / online・focus・visibilitychange 時
- 同期ロジックは `web/src/store.ts` に純粋関数として分離。テストは `store.test.ts`

## 古いブラウザ対応の方針

- 対象タブレットの OS / バージョンは**未確定**。決まったら `web/vite.config.ts` の `build.target`（現在 `es2017`）と `cssTarget` を見直す
- 避けているもの: `crypto.randomUUID`（フォールバックあり）、`Element.closest`（自前実装）、CSS の flex `gap`、`AbortController` 必須前提
- Service Worker（`web/public/sw.js`）はビルドを通さないので ES5 相当で書く。変更したら `CACHE` のバージョンを上げる
- 画面の常時点灯は Wake Lock API があれば使うが、基本は OS 側の設定に任せる
- 日本語入力は素の `<input>` に任せる（独自描画の入力欄にしない）

## コマンド

```bash
npm install
cp api/.dev.vars.example api/.dev.vars   # ローカル用トークン
npm run db:migrate:local -w api          # ローカル D1 にテーブル作成
npm run dev:api                          # wrangler dev (:8787)
npm run dev:web                          # vite (:5173, /api は :8787 にプロキシ)

npm run typecheck
npm test
npm run deploy                           # web をビルドして Worker をデプロイ
```

`npm run build` 後は `npm run dev:api` だけで本番と同じ構成（静的配信＋API）をローカル確認できる。

## ロードマップ / TODO

- [ ] 対象タブレットの OS バージョン確定 → ビルドターゲット調整、実機確認
- [ ] 項目名の編集（現在は追加・DONE・削除のみ）
- [ ] 古い削除済み行（tombstone）の定期削除（Cron Trigger で N 日より古い deleted=1 を消す）
- [ ] 一般公開する場合
  - 共有トークン → ユーザー認証（メール / Google / Apple）とリスト招待・権限管理
  - データを「リスト1つ = Durable Object 1つ（SQLite ストレージ）」に移行。WebSocket（Hibernation API）でリアルタイム同期
  - D1 はユーザー・課金・リスト参加者など全体で共有するデータ用に残す
  - 今の API パス（`/api/lists/:listId/...`）とテーブルの `list_id` はこの移行を見越したもの。崩さないこと

## コーディング規約

- TypeScript strict + `noUncheckedIndexedAccess`
- web は依存ゼロを維持する（フレームワークや大きなライブラリを入れる前に相談）
- コメント・UI 文言は日本語
