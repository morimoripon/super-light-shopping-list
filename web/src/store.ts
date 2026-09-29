// 状態とその更新ロジック（DOM・通信に依存しない純粋関数）。
// テストは store.test.ts。

import type { Item } from "../../shared/types";

export interface State {
  /** 表示用の全項目（削除済みはサーバーに反映されたら取り除く） */
  items: Record<string, Item>;
  /** サーバー未送信の変更。オフライン中はここに溜まる */
  pending: Record<string, Item>;
  /** 次回同期で送る since */
  cursor: number;
}

export function emptyState(): State {
  return { items: {}, pending: {}, cursor: 0 };
}

/** ローカルで項目を変更し、未送信キューに積む */
function touch(state: State, item: Item): State {
  return {
    ...state,
    items: { ...state.items, [item.id]: item },
    pending: { ...state.pending, [item.id]: item },
  };
}

/** 端末の時計が巻き戻っても LWW で負けないよう、必ず前回より大きい時刻にする */
function nextUpdatedAt(prev: Item | undefined, now: number): number {
  return prev && now <= prev.updatedAt ? prev.updatedAt + 1 : now;
}

export function addItem(state: State, id: string, name: string, now: number): State {
  const trimmed = name.trim();
  if (!trimmed) return state;
  return touch(state, {
    id,
    name: trimmed,
    done: false,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  });
}

export function toggleDone(state: State, id: string, now: number): State {
  const item = state.items[id];
  if (!item || item.deleted) return state;
  return touch(state, { ...item, done: !item.done, updatedAt: nextUpdatedAt(item, now) });
}

export function removeItem(state: State, id: string, now: number): State {
  const item = state.items[id];
  if (!item || item.deleted) return state;
  return touch(state, { ...item, deleted: true, updatedAt: nextUpdatedAt(item, now) });
}

/** DONE の項目をまとめて論理削除する */
export function clearDone(state: State, now: number): State {
  let next = state;
  for (const item of Object.values(state.items)) {
    if (item.done && !item.deleted) next = removeItem(next, item.id, now);
  }
  return next;
}

/**
 * 同期レスポンスを取り込む。
 * - 送信済みの変更は、送信後に再変更されていなければ未送信キューから外す
 * - サーバーの項目は updatedAt が新しい（または同じ）ときだけ採用する（LWW）
 * - 未送信の新しいローカル変更がある項目はローカルを優先する
 * - 削除済みで未送信でないものはローカルから取り除く
 */
export function applySyncResult(
  state: State,
  sent: Item[],
  serverItems: Item[],
  cursor: number,
): State {
  const pending = { ...state.pending };
  for (const s of sent) {
    const p = pending[s.id];
    if (p && p.updatedAt === s.updatedAt) delete pending[s.id];
  }

  const items = { ...state.items };
  for (const remote of serverItems) {
    const local = items[remote.id];
    const localPending = pending[remote.id];
    if (localPending && localPending.updatedAt > remote.updatedAt) continue;
    if (local && local.updatedAt > remote.updatedAt) continue;
    items[remote.id] = remote;
  }

  for (const id of Object.keys(items)) {
    if (items[id]!.deleted && !pending[id]) delete items[id];
  }

  return { items, pending, cursor };
}

/** 表示順：未完了（追加順）→ 完了（完了にした順） */
export function visibleItems(state: State): Item[] {
  const list = Object.values(state.items).filter((i) => !i.deleted);
  const todo = list.filter((i) => !i.done).sort((a, b) => a.createdAt - b.createdAt);
  const done = list.filter((i) => i.done).sort((a, b) => a.updatedAt - b.updatedAt);
  return todo.concat(done);
}

export function pendingCount(state: State): number {
  return Object.keys(state.pending).length;
}
