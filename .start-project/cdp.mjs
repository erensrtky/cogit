// .start-project/cdp.mjs — sıfır-bağımlılık Chrome DevTools Protocol yardımcıları.
// smoke.mjs (deterministik `./qa --full` gate) ve browse.mjs (agent-driven MCP
// browser server) ortak kullanır. Harici bağımlılık YOK: global fetch (Node 18+)
// + global WebSocket (Node 21+). BU dosya `start-project --update` ile yeniden
// üretilir — elle düzenleme kalıcı olmaz.

export function toInt(v, dflt) {
  const n = parseInt(v || "", 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* defansif: JSON değilse json=null kalır */
  }
  return { status: res.status, json, text };
}

// CDP HTTP endpoint'i (/json/version) yanıt verene kadar bekler.
export async function waitForCdp(cdpBase, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetchJson(`${cdpBase}/json/version`);
      if (r.json && r.json.webSocketDebuggerUrl) return true;
    } catch {
      /* Chrome henüz dinlemiyor — tekrar dene */
    }
    await sleep(250);
  }
  return false;
}

// Tek bir hedef (page / service worker) için ince CDP istemcisi.
export class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (ev) => {
      const data = typeof ev.data === "string" ? ev.data : String(ev.data);
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || "CDP error"));
        else resolve(msg.result || {});
      } else if (msg.method) {
        for (const fn of this.listeners) {
          try {
            fn(msg);
          } catch {
            /* dinleyici hatası akışı düşürmesin */
          }
        }
      }
    });
  }
  send(method, params) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      } catch (e) {
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  on(fn) {
    this.listeners.push(fn);
  }
}

export function openWs(wsUrl) {
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      reject(e);
      return;
    }
    const t = setTimeout(() => reject(new Error("ws timeout")), 10000);
    ws.addEventListener(
      "open",
      () => {
        clearTimeout(t);
        resolve(ws);
      },
      { once: true },
    );
    ws.addEventListener(
      "error",
      () => {
        clearTimeout(t);
        reject(new Error("ws bağlanamadı"));
      },
      { once: true },
    );
  });
}
