-- 買い物リスト項目
-- 将来 Durable Objects（リスト1つ = DO 1つ）へ移すことを見越して、
-- 全データを list_id 単位で分けて持つ。
CREATE TABLE items (
  list_id    TEXT    NOT NULL,
  id         TEXT    NOT NULL,             -- クライアント生成の UUID
  name       TEXT    NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  deleted    INTEGER NOT NULL DEFAULT 0,   -- 論理削除
  created_at INTEGER NOT NULL,             -- クライアント時計 (ms)
  updated_at INTEGER NOT NULL,             -- クライアント時計 (ms)。LWW の比較に使う
  server_ts  INTEGER NOT NULL,             -- サーバー時計 (ms)。差分同期のカーソルに使う
  PRIMARY KEY (list_id, id)
);

CREATE INDEX idx_items_list_server_ts ON items (list_id, server_ts);
