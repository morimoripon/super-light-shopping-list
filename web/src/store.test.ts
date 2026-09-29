import { describe, expect, it } from "vitest";
import type { Item } from "../../shared/types";
import {
  addItem,
  applySyncResult,
  clearDone,
  emptyState,
  pendingCount,
  removeItem,
  toggleDone,
  visibleItems,
} from "./store";

const ID1 = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";

const item = (over: Partial<Item> = {}): Item => ({
  id: ID1,
  name: "牛乳",
  done: false,
  deleted: false,
  createdAt: 100,
  updatedAt: 100,
  ...over,
});

describe("ローカル操作", () => {
  it("追加すると未送信キューに積まれる", () => {
    const s = addItem(emptyState(), ID1, "  牛乳 ", 100);
    expect(s.items[ID1]?.name).toBe("牛乳");
    expect(pendingCount(s)).toBe(1);
  });

  it("空文字は追加しない", () => {
    expect(pendingCount(addItem(emptyState(), ID1, "   ", 100))).toBe(0);
  });

  it("時計が巻き戻っても updatedAt は単調増加する", () => {
    let s = addItem(emptyState(), ID1, "牛乳", 1000);
    s = toggleDone(s, ID1, 500);
    expect(s.items[ID1]?.updatedAt).toBe(1001);
    expect(s.items[ID1]?.done).toBe(true);
  });

  it("DONE削除は完了済みだけを論理削除する", () => {
    let s = addItem(emptyState(), ID1, "牛乳", 100);
    s = addItem(s, ID2, "卵", 101);
    s = toggleDone(s, ID1, 102);
    s = clearDone(s, 103);
    expect(s.items[ID1]?.deleted).toBe(true);
    expect(s.items[ID2]?.deleted).toBe(false);
    expect(visibleItems(s).map((i) => i.id)).toEqual([ID2]);
  });

  it("未完了が先、完了済みが後に並ぶ", () => {
    let s = addItem(emptyState(), ID1, "牛乳", 100);
    s = addItem(s, ID2, "卵", 200);
    s = toggleDone(s, ID1, 300);
    expect(visibleItems(s).map((i) => i.id)).toEqual([ID2, ID1]);
  });
});

describe("applySyncResult", () => {
  it("送信済みの変更はキューから外れる", () => {
    const s = addItem(emptyState(), ID1, "牛乳", 100);
    const sent = Object.values(s.pending);
    const next = applySyncResult(s, sent, sent, 5000);
    expect(pendingCount(next)).toBe(0);
    expect(next.cursor).toBe(5000);
  });

  it("送信中に再変更された項目はキューに残る", () => {
    let s = addItem(emptyState(), ID1, "牛乳", 100);
    const sent = Object.values(s.pending);
    s = toggleDone(s, ID1, 200); // 通信中の操作
    const next = applySyncResult(s, sent, sent, 5000);
    expect(pendingCount(next)).toBe(1);
    expect(next.items[ID1]?.done).toBe(true);
  });

  it("サーバーの新しい変更を取り込む", () => {
    const s = applySyncResult(emptyState(), [], [item({ updatedAt: 200, done: true })], 1);
    expect(s.items[ID1]?.done).toBe(true);
  });

  it("ローカルの方が新しければサーバーの古い値で上書きしない", () => {
    let s = addItem(emptyState(), ID1, "牛乳", 100);
    s = toggleDone(s, ID1, 300);
    const next = applySyncResult(s, [], [item({ updatedAt: 200, done: false })], 1);
    expect(next.items[ID1]?.done).toBe(true);
  });

  it("削除済みで未送信でないものはローカルから消える", () => {
    let s = addItem(emptyState(), ID1, "牛乳", 100);
    s = removeItem(s, ID1, 200);
    const sent = Object.values(s.pending);
    const next = applySyncResult(s, sent, sent, 1);
    expect(next.items[ID1]).toBeUndefined();
  });

  it("他端末での削除を反映する", () => {
    let s = addItem(emptyState(), ID1, "牛乳", 100);
    s = applySyncResult(s, Object.values(s.pending), [], 1);
    const next = applySyncResult(s, [], [item({ deleted: true, updatedAt: 300 })], 2);
    expect(visibleItems(next)).toEqual([]);
  });

  it("同じ項目を重複して受け取っても結果は変わらない（冪等）", () => {
    const remote = item({ updatedAt: 200 });
    const once = applySyncResult(emptyState(), [], [remote], 1);
    const twice = applySyncResult(once, [], [remote], 1);
    expect(twice.items).toEqual(once.items);
  });
});
