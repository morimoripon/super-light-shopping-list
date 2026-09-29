import type { Item } from "../../shared/types";

interface ItemRow {
  id: string;
  name: string;
  done: number;
  deleted: number;
  created_at: number;
  updated_at: number;
}

/**
 * 変更をまとめて upsert する。
 * 既存行より updated_at が新しい場合だけ上書きする（Last-Write-Wins）。
 */
export async function applyChanges(
  db: D1Database,
  listId: string,
  changes: Item[],
  serverTs: number,
): Promise<void> {
  if (changes.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO items (list_id, id, name, done, deleted, created_at, updated_at, server_ts)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT (list_id, id) DO UPDATE SET
       name       = excluded.name,
       done       = excluded.done,
       deleted    = excluded.deleted,
       updated_at = excluded.updated_at,
       server_ts  = excluded.server_ts
     WHERE excluded.updated_at > items.updated_at`,
  );
  await db.batch(
    changes.map((c) =>
      stmt.bind(
        listId,
        c.id,
        c.name,
        c.done ? 1 : 0,
        c.deleted ? 1 : 0,
        c.createdAt,
        c.updatedAt,
        serverTs,
      ),
    ),
  );
}

/**
 * since 以降にサーバーで更新された項目を返す。
 * 同一ミリ秒の書き込みを取りこぼさないよう >= で取得する（クライアント側のマージは冪等）。
 */
export async function fetchChangesSince(
  db: D1Database,
  listId: string,
  since: number,
): Promise<Item[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, done, deleted, created_at, updated_at
       FROM items
       WHERE list_id = ?1 AND server_ts >= ?2
         AND (?2 > 0 OR deleted = 0)  -- 初回同期では削除済みを送らない
       ORDER BY server_ts`,
    )
    .bind(listId, since)
    .all<ItemRow>();

  return results.map((r) => ({
    id: r.id,
    name: r.name,
    done: r.done === 1,
    deleted: r.deleted === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
