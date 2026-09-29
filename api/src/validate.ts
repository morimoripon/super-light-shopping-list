import { ITEM_ID_PATTERN, LIMITS, type Item, type SyncRequest } from "../../shared/types";

/** リクエストボディを検証して SyncRequest に変換する。不正なら null */
export function parseSyncRequest(body: unknown): SyncRequest | null {
  if (!isObject(body)) return null;
  const { since, changes } = body;
  if (!isNonNegativeInt(since)) return null;
  if (!Array.isArray(changes) || changes.length > LIMITS.changesPerSync) return null;

  const items: Item[] = [];
  for (const c of changes) {
    const item = parseItem(c);
    if (!item) return null;
    items.push(item);
  }
  return { since, changes: items };
}

function parseItem(v: unknown): Item | null {
  if (!isObject(v)) return null;
  const { id, name, done, deleted, createdAt, updatedAt } = v;
  if (typeof id !== "string" || !ITEM_ID_PATTERN.test(id)) return null;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > LIMITS.nameMaxLength) return null;
  if (typeof done !== "boolean" || typeof deleted !== "boolean") return null;
  if (!isNonNegativeInt(createdAt) || !isNonNegativeInt(updatedAt)) return null;
  return { id, name: trimmed, done, deleted, createdAt, updatedAt };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}
