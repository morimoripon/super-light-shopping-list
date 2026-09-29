// localStorage への保存。プライベートモード等で例外が出ても動作を止めない。

import { emptyState, type State } from "./store";

export interface Config {
  token: string;
  listId: string;
}

const CONFIG_KEY = "sls:config";
const stateKey = (listId: string) => `sls:v1:state:${listId}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくてもメモリ上では動き続ける
  }
}

export function loadConfig(): Config | null {
  const c = read<Config>(CONFIG_KEY);
  return c && typeof c.token === "string" && typeof c.listId === "string" ? c : null;
}

export function saveConfig(config: Config): void {
  write(CONFIG_KEY, config);
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* noop */
  }
}

export function loadState(listId: string): State {
  const s = read<State>(stateKey(listId));
  if (!s || typeof s.cursor !== "number" || !s.items || !s.pending) return emptyState();
  return s;
}

export function saveState(listId: string, state: State): void {
  write(stateKey(listId), state);
}
