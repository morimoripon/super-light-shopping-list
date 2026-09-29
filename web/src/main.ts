import "./style.css";
import { LIMITS, LIST_ID_PATTERN } from "../../shared/types";
import { uuid } from "./id";
import { clearConfig, loadConfig, loadState, saveConfig, saveState, type Config } from "./persist";
import {
  addItem,
  applySyncResult,
  clearDone,
  pendingCount,
  removeItem,
  toggleDone,
  visibleItems,
  type State,
} from "./store";
import { syncOnce } from "./sync";

const POLL_INTERVAL_MS = 15_000;
const SYNC_DEBOUNCE_MS = 300;

const app = document.getElementById("app")!;

// ---------------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------------

const config = readConfigFromUrl() ?? loadConfig();
if (config) startList(config);
else renderSetup();

registerServiceWorker();

/** ?token=...&list=... で開かれたら設定として保存し、URL からトークンを消す */
function readConfigFromUrl(): Config | null {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  const listId = params.get("list");
  if (!token || !listId || !LIST_ID_PATTERN.test(listId)) return null;
  const c = { token, listId };
  saveConfig(c);
  history.replaceState(null, "", location.pathname);
  return c;
}

// ---------------------------------------------------------------------------
// 初期設定画面
// ---------------------------------------------------------------------------

function renderSetup(message?: string): void {
  app.innerHTML = `
    <form class="setup" id="setup">
      <h1>買い物リスト</h1>
      ${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}
      <label>リストID<input name="listId" required pattern="[A-Za-z0-9_\\-]{1,64}" placeholder="family" autocomplete="off"></label>
      <label>APIトークン<input name="token" required type="password" autocomplete="off"></label>
      <button type="submit">はじめる</button>
    </form>`;
  const form = document.getElementById("setup") as HTMLFormElement;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const c = {
      listId: String(data.get("listId") ?? "").trim(),
      token: String(data.get("token") ?? "").trim(),
    };
    if (!LIST_ID_PATTERN.test(c.listId) || !c.token) return;
    saveConfig(c);
    startList(c);
  });
}

// ---------------------------------------------------------------------------
// リスト画面
// ---------------------------------------------------------------------------

type Status = "idle" | "syncing" | "offline" | "error";

function startList(config: Config): void {
  let state: State = loadState(config.listId);
  let status: Status = "idle";
  let lastSyncedAt: number | null = null;
  let inFlight = false;
  let again = false;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  app.innerHTML = `
    <header class="bar">
      <form id="add" class="add" autocomplete="off">
        <input id="name" enterkeyhint="done" maxlength="${LIMITS.nameMaxLength}" placeholder="買うものを追加" aria-label="買うもの">
        <button type="submit" aria-label="追加">＋</button>
      </form>
    </header>
    <ul id="list" class="list"></ul>
    <footer class="bar foot">
      <span id="status" class="status"></span>
      <button id="clear" class="clear" type="button">DONEを削除</button>
    </footer>`;

  const form = document.getElementById("add") as HTMLFormElement;
  const input = document.getElementById("name") as HTMLInputElement;
  const listEl = document.getElementById("list")!;
  const statusEl = document.getElementById("status")!;
  const clearBtn = document.getElementById("clear") as HTMLButtonElement;

  const update = (next: State) => {
    state = next;
    saveState(config.listId, state);
    render();
  };

  const render = () => {
    const items = visibleItems(state);
    listEl.innerHTML = items.length
      ? items
          .map(
            (i) => `
        <li class="item${i.done ? " done" : ""}" data-id="${i.id}">
          <button class="toggle" data-action="toggle" type="button">
            <span class="check" aria-hidden="true">${i.done ? "✓" : ""}</span>
            <span class="name">${escapeHtml(i.name)}</span>
          </button>
          <button class="remove" data-action="remove" type="button" aria-label="削除">×</button>
        </li>`,
          )
          .join("")
      : `<li class="empty">リストは空です</li>`;
    clearBtn.disabled = !items.some((i) => i.done);
    renderStatus();
  };

  const renderStatus = () => {
    const n = pendingCount(state);
    let text: string;
    if (status === "offline") text = n ? `オフライン（未送信 ${n}件）` : "オフライン";
    else if (status === "error") text = "同期エラー";
    else if (n) text = `未送信 ${n}件`;
    else if (lastSyncedAt) text = `同期済み ${formatTime(lastSyncedAt)}`;
    else text = "同期中…";
    statusEl.textContent = text;
    statusEl.className = `status ${status}`;
  };

  const sync = async (): Promise<void> => {
    if (stopped) return;
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    try {
      const result = await syncOnce(config.token, config.listId, state.cursor, state.pending);
      if (result.kind === "ok") {
        // 通信中に行われたローカル変更を消さないよう、最新の state に対して適用する
        update(applySyncResult(state, result.sent, result.response.items, result.response.serverTime));
        status = "idle";
        lastSyncedAt = Date.now();
        if (pendingCount(state) > 0 && result.sent.length > 0) again = true;
      } else if (result.kind === "unauthorized") {
        stopped = true;
        clearConfig();
        renderSetup("トークンが正しくありません。設定し直してください。");
        return;
      } else {
        status = result.kind === "offline" ? "offline" : "error";
      }
      renderStatus();
    } finally {
      inFlight = false;
      if (again && !stopped) {
        again = false;
        void sync();
      }
    }
  };

  const syncSoon = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void sync(), SYNC_DEBOUNCE_MS);
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value;
    if (!name.trim()) return;
    update(addItem(state, uuid(), name, Date.now()));
    input.value = "";
    syncSoon();
  });

  listEl.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const actionEl = closest(target, "[data-action]");
    const li = closest(target, "[data-id]");
    if (!actionEl || !li) return;
    const id = li.getAttribute("data-id")!;
    const action = actionEl.getAttribute("data-action");
    if (action === "toggle") update(toggleDone(state, id, Date.now()));
    else if (action === "remove") update(removeItem(state, id, Date.now()));
    syncSoon();
  });

  clearBtn.addEventListener("click", () => {
    update(clearDone(state, Date.now()));
    syncSoon();
  });

  // 画面表示中だけポーリングする（非表示の間は通信しない）
  setInterval(() => {
    if (document.visibilityState !== "hidden") void sync();
  }, POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void sync();
      void keepScreenOn();
    }
  });
  window.addEventListener("online", () => void sync());
  window.addEventListener("focus", () => void sync());

  render();
  void sync();
  void keepScreenOn();
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** 対応ブラウザでは画面を消さない。未対応なら何もしない（OS 側の設定で対応する） */
async function keepScreenOn(): Promise<void> {
  const nav = navigator as Navigator & {
    wakeLock?: { request(type: "screen"): Promise<unknown> };
  };
  try {
    if (nav.wakeLock) await nav.wakeLock.request("screen");
  } catch {
    /* 非対応・省電力モードなど */
  }
}

function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW が無くてもオンラインでは動く */
    });
  });
}

/** Element.closest は古い Android WebView に無いことがあるので自前で辿る */
function closest(el: HTMLElement | null, selector: string): HTMLElement | null {
  const attr = selector.slice(1, -1); // "[data-id]" -> "data-id"
  while (el && el !== document.body) {
    if (el.hasAttribute(attr)) return el;
    el = el.parentElement;
  }
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => (n < 10 ? "0" : "") + n;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
