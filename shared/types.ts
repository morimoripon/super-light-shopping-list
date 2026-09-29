// API とフロントで共有する型定義。
// ここを変えたら api/ と web/ の両方の型チェックを通すこと。

/** 買い物リストの1項目。削除は論理削除（deleted=true）で表す。 */
export interface Item {
  /** クライアントで生成する UUID v4 */
  id: string;
  name: string;
  done: boolean;
  deleted: boolean;
  /** 作成時刻（クライアント時計, epoch ms）。並び順に使う */
  createdAt: number;
  /** 最終更新時刻（クライアント時計, epoch ms）。競合時は大きい方が勝つ（LWW） */
  updatedAt: number;
}

/** POST /api/lists/:listId/sync のリクエスト */
export interface SyncRequest {
  /** 前回の同期でサーバーから受け取った serverTime。初回は 0 */
  since: number;
  /** 未送信のローカル変更 */
  changes: Item[];
}

/** POST /api/lists/:listId/sync のレスポンス */
export interface SyncResponse {
  /**
   * 次回の since に使うカーソル（サーバー時計, epoch ms）。
   * 取りこぼし防止のため少し巻き戻した値が返るので、クライアントは値の意味を解釈せずそのまま送り返す。
   */
  serverTime: number;
  /** since 以降にサーバー側で更新された項目（削除済みを含む） */
  items: Item[];
}

export const LIMITS = {
  nameMaxLength: 200,
  changesPerSync: 500,
} as const;

/** listId に使える文字。URL・DOのIDにそのまま使えるよう制限する */
export const LIST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const ITEM_ID_PATTERN = /^[0-9a-f-]{36}$/;
