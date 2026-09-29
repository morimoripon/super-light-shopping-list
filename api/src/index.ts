import { Hono } from "hono";
import { LIST_ID_PATTERN, type SyncResponse } from "../../shared/types";
import { applyChanges, fetchChangesSince } from "./db";
import { parseSyncRequest } from "./validate";

export interface Env {
  DB: D1Database;
  /** 家族用の共有トークン。`wrangler secret put API_TOKEN` で設定する */
  API_TOKEN: string;
}

const SYNC_OVERLAP_MS = 10_000;

const app = new Hono<{ Bindings: Env }>();

// --- 認証（家族用の共有トークン方式。一般公開時はユーザー認証に置き換える） ---
app.use("/api/*", async (c, next) => {
  const expected = c.env.API_TOKEN;
  if (!expected) return c.json({ error: "server token is not configured" }, 500);
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(token, expected)) return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true }));

/**
 * 差分同期。未送信の変更を受け取って反映し、since 以降の変更を返す。
 * 1往復で「送信」と「受信」を済ませることで、古い端末でも通信回数を抑える。
 */
app.post("/api/lists/:listId/sync", async (c) => {
  const listId = c.req.param("listId");
  if (!LIST_ID_PATTERN.test(listId)) return c.json({ error: "invalid listId" }, 400);

  const body = parseSyncRequest(await c.req.json().catch(() => null));
  if (!body) return c.json({ error: "invalid request body" }, 400);

  const serverTime = Date.now();
  await applyChanges(c.env.DB, listId, body.changes, serverTime);
  const items = await fetchChangesSince(c.env.DB, listId, body.since);

  // 並行リクエストの書き込みを取りこぼさないよう、カーソルを少し巻き戻して返す。
  // 重複して受け取った項目はクライアントのマージ（LWW）で無害に処理される。
  const res: SyncResponse = { serverTime: Math.max(0, serverTime - SYNC_OVERLAP_MS), items };
  return c.json(res);
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

export default app;

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // 長さの違いでも比較時間が変わらないよう、常に expected 側の長さでループする
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < bb.length; i++) diff |= (ab[i] ?? 0) ^ bb[i]!;
  return diff === 0;
}
