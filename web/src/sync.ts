// サーバーとの同期。未送信の変更を送り、差分を受け取る。

import type { Item, SyncRequest, SyncResponse } from "../../shared/types";
import { LIMITS } from "../../shared/types";

export type SyncOutcome =
  | { kind: "ok"; sent: Item[]; response: SyncResponse }
  | { kind: "unauthorized" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

const TIMEOUT_MS = 15_000;

export async function syncOnce(
  token: string,
  listId: string,
  since: number,
  pending: Record<string, Item>,
): Promise<SyncOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };

  const sent = Object.values(pending).slice(0, LIMITS.changesPerSync);
  const body: SyncRequest = { since, changes: sent };

  // AbortController は古いブラウザに無いことがあるので存在チェックする
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;

  try {
    const res = await fetch(`/api/lists/${encodeURIComponent(listId)}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    });
    if (res.status === 401) return { kind: "unauthorized" };
    if (!res.ok) return { kind: "error", message: `HTTP ${res.status}` };
    const response = (await res.json()) as SyncResponse;
    return { kind: "ok", sent, response };
  } catch {
    // ネットワーク断・タイムアウト。未送信キューは残るので次回に再送される
    return { kind: "offline" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
