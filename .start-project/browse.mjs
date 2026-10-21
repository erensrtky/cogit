// .start-project/browse.mjs — agent-driven browser MCP server (stdio JSON-RPC).
// `.start-project/browse` (bash) Chrome'u headless + CDP ile açar; bu script tek
// bir page target'a bağlanıp MCP tool'ları sunar:
//   navigate · read_console · read_network · screenshot · eval · click · type · wait_for
// Deterministik smoke gate'ten (smoke.mjs) FARKLI: bu, agent'ın login akışı /
// route değişikliği gibi şeyleri elle deneyip console/network izlemesi için.
// Harici bağımlılık YOK — CDP borusu cdp.mjs'den (smoke ile ortak).
// BU dosya `start-project --update --e2e` ile yeniden üretilir.

import { createInterface } from "node:readline";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fetchJson, waitForCdp, CDPClient, openWs, sleep, toInt } from "./cdp.mjs";

const CHROME_BIN = process.env.QA_E2E_CHROME_BIN || "";
const HEADFUL = (process.env.QA_E2E_HEADFUL || "0") === "1";
const BASE = (process.env.QA_E2E_BASE_URL || "").trim();
const SETTLE_MS = toInt(process.env.BROWSE_SETTLE_MS, 1200);
const LOAD_TIMEOUT_MS = toInt(process.env.BROWSE_LOAD_TIMEOUT_MS, 20000);
const PROTOCOL = "2025-06-18";

// ── Chrome yaşam döngüsü — browse.mjs sahibi (node child_process) ──────────
let chromeProc = null;
let udd = null;
let CDP = "";

async function launchChrome() {
  if (chromeProc) return;
  if (!CHROME_BIN) throw new Error("QA_E2E_CHROME_BIN yok (launcher çözemedi)");
  udd = mkdtempSync(join(tmpdir(), "sp-browse-"));
  // --remote-debugging-port=0 → Chrome boş port seçip stderr'e yazar
  // ("DevTools listening on ws://127.0.0.1:PORT/...") — bash'te port yarışı YOK.
  // Nested user-ns (bwrap/CI) → --no-sandbox zorunlu (bkz. smoke).
  const flags = [
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    `--user-data-dir=${udd}`,
    "about:blank",
  ];
  if (!HEADFUL) flags.unshift("--headless=new");
  chromeProc = spawn(CHROME_BIN, flags, { stdio: ["ignore", "ignore", "pipe"] });
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    const to = setTimeout(
      () => reject(new Error("Chrome DevTools portu 15s'te okunamadı")),
      15000,
    );
    chromeProc.stderr.on("data", (d) => {
      buf += d.toString();
      const m = buf.match(/ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) {
        clearTimeout(to);
        resolve(parseInt(m[1], 10));
      }
    });
    chromeProc.on("exit", () => {
      clearTimeout(to);
      reject(new Error("Chrome erken kapandı"));
    });
  });
  CDP = `http://127.0.0.1:${port}`;
}

// CHROME_BIN bir sarmalayıcıysa (Flatpak: `exec flatpak run …`) chromeProc
// sarmalayıcı/bwrap olur; onu öldürmek sandbox içindeki asıl Chrome'u
// öldürmez → sahipsiz kalırdı. Profil dizini bu oturuma özgü → onu kullanan
// her süreci süpür (senkron: exit handler'dan da çağrılabilsin).
function sweepChrome() {
  if (!udd) return;
  try {
    execFileSync("pkill", ["-KILL", "-f", "--", `--user-data-dir=${udd}`], { stdio: "ignore" });
  } catch {
    /* eşleşme yok ya da pkill yok */
  }
}

// Birden çok tetik (rl close + SIGTERM) gelebilir — guarded call HEMEN dönmeli,
// process.exit'i ilk (asıl temizliği yapan) çağrı tetikler. Aksi halde guarded
// çağrı erken exit edip rmSync'i yarıda keser → tmpdir sızar.
let shuttingDown = false;
async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (chromeProc && chromeProc.exitCode === null) {
    const ended = new Promise((r) => chromeProc.once("exit", r));
    try {
      chromeProc.kill("SIGKILL");
    } catch {
      /* zaten ölmüş */
    }
    await Promise.race([ended, sleep(2000)]);
  }
  sweepChrome();
  if (udd) {
    try {
      rmSync(udd, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    } catch {
      /* yok say */
    }
  }
  process.exit(code || 0);
}
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => {
    shutdown(0);
  });
}
// Son çare (async bekleyemez): en azından Chrome'u öldür.
process.on("exit", () => {
  if (chromeProc && chromeProc.exitCode === null) {
    try {
      chromeProc.kill("SIGKILL");
    } catch {
      /* yok say */
    }
  }
  sweepChrome();
});

// ── stdio JSON-RPC ────────────────────────────────────────────────────────
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function reply(id, result) {
  if (id === undefined || id === null) return;
  send({ jsonrpc: "2.0", id, result });
}
function replyErr(id, code, message) {
  if (id === undefined || id === null) return;
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

// ── tarayıcı durumu ──────────────────────────────────────────────────────
let client = null;
let targetId = null;
const state = {
  url: "about:blank",
  console: [], // {type, text}
  network: [], // {id, method, url, status, failed, errorText}
  exceptions: [], // text
  navMark: { c: 0, n: 0, e: 0 },
  loadedResolve: null,
};

function trimBuf(arr, max = 500) {
  if (arr.length > max) arr.splice(0, arr.length - max);
}
function fmtArgs(args) {
  return (args || [])
    .map((a) => {
      if (a && a.value !== undefined)
        return typeof a.value === "string" ? a.value : JSON.stringify(a.value);
      return (
        (a && (a.description || (a.preview && a.preview.description) || a.type)) ||
        "?"
      );
    })
    .join(" ")
    .slice(0, 2000);
}
function fmtException(p) {
  const d = (p && p.exceptionDetails) || {};
  const ex = d.exception || {};
  return String(
    ex.description || ex.value || d.text || "Uncaught exception",
  ).slice(0, 2000);
}

async function ensureBrowser() {
  if (client) return;
  await launchChrome();
  if (!(await waitForCdp(CDP, 15000)))
    throw new Error(`Chrome CDP ${CDP} hazır değil`);
  let created = await fetchJson(`${CDP}/json/new?about:blank`, { method: "PUT" });
  if (!created.json || !created.json.webSocketDebuggerUrl)
    created = await fetchJson(`${CDP}/json/new?about:blank`);
  if (!created.json || !created.json.webSocketDebuggerUrl)
    throw new Error("sekme açılamadı");
  targetId = created.json.id;
  const ws = await openWs(created.json.webSocketDebuggerUrl);
  client = new CDPClient(ws);
  client.on((msg) => {
    const p = msg.params || {};
    switch (msg.method) {
      case "Runtime.consoleAPICalled":
        state.console.push({ type: p.type || "log", text: fmtArgs(p.args) });
        trimBuf(state.console);
        break;
      case "Runtime.exceptionThrown":
        state.exceptions.push(fmtException(p));
        trimBuf(state.exceptions);
        break;
      case "Log.entryAdded":
        if (p.entry && p.entry.source !== "network")
          state.console.push({
            type: p.entry.level || "info",
            text: String(p.entry.text || "").slice(0, 2000),
          });
        trimBuf(state.console);
        break;
      case "Network.requestWillBeSent":
        if (p.request)
          state.network.push({
            id: p.requestId,
            method: p.request.method,
            url: p.request.url,
            status: 0,
            failed: false,
            errorText: "",
          });
        trimBuf(state.network);
        break;
      case "Network.responseReceived": {
        const r = state.network.find((x) => x.id === p.requestId);
        if (r && p.response) r.status = p.response.status;
        break;
      }
      case "Network.loadingFailed": {
        const r = state.network.find((x) => x.id === p.requestId);
        if (r) {
          r.failed = !p.canceled;
          r.errorText = p.errorText || "failed";
        }
        break;
      }
      case "Page.loadEventFired":
        if (state.loadedResolve) {
          state.loadedResolve();
          state.loadedResolve = null;
        }
        break;
    }
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("Log.enable");
  await applyExtraHeaders();
  await applyStorageState();
}

async function applyExtraHeaders() {
  const raw = (process.env.QA_E2E_EXTRA_HEADERS || "").trim();
  if (!raw) return;
  let headers;
  try {
    headers = JSON.parse(raw);
  } catch {
    throw new Error("QA_E2E_EXTRA_HEADERS geçerli JSON değil");
  }
  await client.send("Network.setExtraHTTPHeaders", { headers });
}

async function applyStorageState() {
  const path = (process.env.QA_E2E_STORAGE_STATE || "").trim();
  if (!path) return;
  let st;
  try {
    st = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`QA_E2E_STORAGE_STATE okunamadı: ${e.message}`);
  }
  for (const c of st.cookies || []) {
    try {
      await client.send("Network.setCookie", c);
    } catch {
      /* tek çerez hatası akışı düşürmesin */
    }
  }
  const origins = st.origins || [];
  if (origins.length) {
    const script = origins
      .map((o) => {
        const items = (o.localStorage || [])
          .map(
            (kv) =>
              `try{localStorage.setItem(${JSON.stringify(
                kv.name,
              )},${JSON.stringify(kv.value)})}catch(e){}`,
          )
          .join("");
        return `if(location.origin===${JSON.stringify(o.origin)}){${items}}`;
      })
      .join("\n");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: script,
    });
  }
}

function resolveUrl(u) {
  u = String(u || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (BASE) {
    try {
      return new URL(u, BASE).toString();
    } catch {
      return u;
    }
  }
  return u;
}

async function evalJs(expression, opts) {
  return client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    ...(opts || {}),
  });
}

async function waitSelector(sel, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await evalJs(
      `!!document.querySelector(${JSON.stringify(sel)})`,
    ).catch(() => null);
    if (r && r.result && r.result.value === true) return true;
    await sleep(120);
  }
  return false;
}

// ── tool handler'lar ─────────────────────────────────────────────────────
async function tNavigate(args) {
  await ensureBrowser();
  const url = resolveUrl(args.url);
  if (!url) throw new Error("url gerekli");
  state.navMark = {
    c: state.console.length,
    n: state.network.length,
    e: state.exceptions.length,
  };
  const loaded = new Promise((r) => (state.loadedResolve = r));
  await client.send("Page.navigate", { url });
  await Promise.race([loaded, sleep(LOAD_TIMEOUT_MS)]);
  await sleep(SETTLE_MS);
  const href = await evalJs("location.href").catch(() => null);
  const title = await evalJs("document.title").catch(() => null);
  state.url = (href && href.result && href.result.value) || url;
  const cErr = state.console
    .slice(state.navMark.c)
    .filter((c) => c.type === "error" || c.type === "assert").length;
  const nFail = state.network
    .slice(state.navMark.n)
    .filter((r) => r.failed || r.status >= 400).length;
  const exc = state.exceptions.length - state.navMark.e;
  return (
    `navigated: ${state.url}\n` +
    `title: ${(title && title.result && title.result.value) || ""}\n` +
    `since navigation: ${cErr} console error(s), ${nFail} failed request(s), ${exc} exception(s)\n` +
    `→ read_console / read_network ile ayrıntı`
  );
}

async function tReadConsole(args) {
  await ensureBrowser();
  const from = args.since === "all" ? 0 : state.navMark.c;
  let list = state.console.slice(from);
  if (args.level !== "all")
    list = list.filter((c) => c.type === "error" || c.type === "assert");
  const exc =
    args.since === "all"
      ? state.exceptions
      : state.exceptions.slice(state.navMark.e);
  const lines = [
    ...list.map((c) => `[${c.type}] ${c.text}`),
    ...exc.map((e) => `[exception] ${e}`),
  ];
  return lines.length ? lines.join("\n").slice(0, 8000) : "(console temiz)";
}

async function tReadNetwork(args) {
  await ensureBrowser();
  const from = args.since === "all" ? 0 : state.navMark.n;
  let list = state.network.slice(from);
  if (args.filter !== "all")
    list = list.filter((r) => r.failed || r.status >= 400);
  if (!list.length) return "(eşleşen istek yok)";
  return list
    .map(
      (r) =>
        `${r.failed ? "FAIL" : r.status || "..."} ${r.method} ${r.url}` +
        (r.errorText ? ` — ${r.errorText}` : ""),
    )
    .join("\n")
    .slice(0, 8000);
}

async function tScreenshot(args) {
  await ensureBrowser();
  const r = await client.send("Page.captureScreenshot", {
    format: "png",
    ...(args.full_page ? { captureBeyondViewport: true } : {}),
  });
  return { image: r.data, mimeType: "image/png" };
}

async function tEval(args) {
  await ensureBrowser();
  const expr = String(args.expression || args.js || "");
  if (!expr) throw new Error("expression gerekli");
  const r = await evalJs(expr);
  if (r.exceptionDetails)
    return { isError: true, text: fmtException({ exceptionDetails: r.exceptionDetails }) };
  const v = r.result || {};
  if ("value" in v)
    return typeof v.value === "string" ? v.value : JSON.stringify(v.value);
  return v.description || v.type || "undefined";
}

async function tWaitFor(args) {
  await ensureBrowser();
  const sel = String(args.selector || "");
  if (!sel) throw new Error("selector gerekli");
  const ok = await waitSelector(sel, toInt(args.timeout_ms, 8000));
  return ok
    ? `bulundu: ${sel}`
    : { isError: true, text: `selector belirmedi (timeout): ${sel}` };
}

async function tClick(args) {
  await ensureBrowser();
  const sel = String(args.selector || "");
  if (!sel) throw new Error("selector gerekli");
  if (!(await waitSelector(sel, toInt(args.timeout_ms, 8000))))
    return { isError: true, text: `selector bulunamadı: ${sel}` };
  const r = await evalJs(
    `(()=>{const el=document.querySelector(${JSON.stringify(
      sel,
    )});if(!el)return"notfound";el.scrollIntoView({block:"center"});el.click();return"ok"})()`,
  );
  return r.result && r.result.value === "ok"
    ? `tıklandı: ${sel}`
    : { isError: true, text: `tıklanamadı: ${sel}` };
}

async function tType(args) {
  await ensureBrowser();
  const sel = String(args.selector || "");
  const text = args.text == null ? "" : String(args.text);
  if (!sel) throw new Error("selector gerekli");
  if (!(await waitSelector(sel, toInt(args.timeout_ms, 8000))))
    return { isError: true, text: `selector bulunamadı: ${sel}` };
  const clear = args.clear !== false;
  const T = JSON.stringify(text);
  const expr =
    `(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return"notfound";el.focus();` +
    `if(el.isContentEditable){${clear ? 'el.textContent="";' : ""}el.textContent+=${T};}` +
    `else{const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;` +
    `const d=Object.getOwnPropertyDescriptor(proto,"value");const nv=${clear ? T : `el.value+${T}`};` +
    `if(d&&d.set){d.set.call(el,nv);}else{el.value=nv;}}` +
    `el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return"ok"})()`;
  const r = await evalJs(expr);
  return r.result && r.result.value === "ok"
    ? `yazıldı: ${sel}`
    : { isError: true, text: `yazılamadı: ${sel}` };
}

const TOOLS = [
  {
    name: "navigate",
    description:
      "Bir URL'ye git (QA_E2E_BASE_URL ayarlıysa '/yol' göreli çözülür), yüklenmesini bekle, kısa console/network/exception özeti döndür.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
    handler: tNavigate,
  },
  {
    name: "read_console",
    description:
      "Sayfa console mesajları + yakalanmamış exception'lar. Varsayılan: son navigate'ten beri hatalar. level:'all' tüm seviyeler, since:'all' tüm oturum.",
    inputSchema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["all", "error"] },
        since: { type: "string", enum: ["navigation", "all"] },
      },
    },
    handler: tReadConsole,
  },
  {
    name: "read_network",
    description:
      "Ağ istekleri. Varsayılan: son navigate'ten beri başarısız (HTTP >=400 veya bağlantı hatası). filter:'all' hepsi, since:'all' tüm oturum.",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["all", "failed"] },
        since: { type: "string", enum: ["navigation", "all"] },
      },
    },
    handler: tReadNetwork,
  },
  {
    name: "screenshot",
    description: "Sayfanın PNG ekran görüntüsü (full_page:true → viewport ötesi).",
    inputSchema: {
      type: "object",
      properties: { full_page: { type: "boolean" } },
    },
    handler: tScreenshot,
  },
  {
    name: "eval",
    description:
      "Sayfa bağlamında JavaScript çalıştır ve sonucu döndür (await destekli). Hata → isError.",
    inputSchema: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
    handler: tEval,
  },
  {
    name: "click",
    description:
      "CSS selector'a uyan ilk elemana tıkla (belirene kadar bekler; timeout_ms varsayılan 8000).",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        timeout_ms: { type: "number" },
      },
      required: ["selector"],
    },
    handler: tClick,
  },
  {
    name: "type",
    description:
      "input / textarea / contenteditable elemana metin yaz. Varsayılan içeriği değiştirir; clear:false ekler.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        text: { type: "string" },
        clear: { type: "boolean" },
        timeout_ms: { type: "number" },
      },
      required: ["selector", "text"],
    },
    handler: tType,
  },
  {
    name: "wait_for",
    description:
      "Bir CSS selector DOM'da belirene kadar bekle (timeout_ms varsayılan 8000).",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        timeout_ms: { type: "number" },
      },
      required: ["selector"],
    },
    handler: tWaitFor,
  },
];

async function handleCall(id, params) {
  const name = params && params.name;
  const args = (params && params.arguments) || {};
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return replyErr(id, -32602, `bilinmeyen tool: ${name}`);
  try {
    const out = await tool.handler(args);
    if (out && typeof out === "object" && out.image) {
      reply(id, {
        content: [
          { type: "image", data: out.image, mimeType: out.mimeType },
        ],
      });
    } else if (out && typeof out === "object" && out.isError) {
      reply(id, {
        content: [{ type: "text", text: out.text || "hata" }],
        isError: true,
      });
    } else {
      reply(id, { content: [{ type: "text", text: String(out) }] });
    }
  } catch (e) {
    reply(id, {
      content: [
        { type: "text", text: `hata: ${e && e.message ? e.message : e}` },
      ],
      isError: true,
    });
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (raw) => {
  const line = raw.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === "initialize") {
    reply(id, {
      protocolVersion: (params && params.protocolVersion) || PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: "start-project-browse", version: "1" },
    });
  } else if (
    method === "notifications/initialized" ||
    method === "initialized"
  ) {
    /* no reply */
  } else if (method === "ping") {
    reply(id, {});
  } else if (method === "tools/list") {
    reply(id, {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  } else if (method === "tools/call") {
    handleCall(id, params);
  } else if (method && method.startsWith("notifications/")) {
    /* yok say */
  } else if (id !== undefined && id !== null) {
    replyErr(id, -32601, `desteklenmeyen method: ${method}`);
  }
});
rl.on("close", () => {
  shutdown(0);
});
