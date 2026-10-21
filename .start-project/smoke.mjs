// .start-project/smoke.mjs — sıfır-bağımlılık web smoke checker (Node + CDP).
// `.start-project/smoke` (bash) sistem Chrome/Chromium'u headless + CDP ile
// ayağa kaldırır, bu script de her URL'yi gezip konsol hatası / yakalanmamış
// exception / başarısız istek (+ opsiyonel gövde-metni eşleşmesi) arar.
// Harici bağımlılık YOK: global fetch (Node 18+) + global WebSocket (Node 21+).
// CDP borusu (fetchJson / waitForCdp / CDPClient / openWs) cdp.mjs'de — browse.mjs
// ile ORTAK. BU dosya `start-project --update` ile yeniden üretilir.

import {
  toInt,
  sleep,
  fetchJson,
  waitForCdp,
  CDPClient,
  openWs,
} from "./cdp.mjs";

const PORT = process.env.SMOKE_CDP_PORT || "";
const BASE = process.env.QA_SMOKE_BASE_URL || "";
const RAW_URLS = (process.env.QA_SMOKE_URLS || "/").trim();
const SETTLE_MS = toInt(process.env.SMOKE_SETTLE_MS, 1500);
const LOAD_TIMEOUT_MS = toInt(process.env.SMOKE_LOAD_TIMEOUT_MS, 20000);
const CDP_READY_TIMEOUT_MS = 15000;
const CDP = `http://127.0.0.1:${PORT}`;

function fail(msg) {
  console.log(msg);
  process.exit(1);
}

if (!BASE) {
  console.log("smoke: QA_SMOKE_BASE_URL boş — atlandı");
  process.exit(0);
}
if (!PORT) fail("SMOKE FAIL: SMOKE_CDP_PORT verilmedi");

// "/yol" veya "/yol::beklenen metin" — :: sonrası opsiyonel gövde-metni iddiası.
// Girdiler boşlukla ayrılır; beklenen metin de boşluk içerebildiğinden, bir ::
// girdisinden sonraki "yol gibi görünmeyen" tokenlar o metne eklenir (yeni bir
// yol `/`, `./` ya da `http(s)://` ile başlayınca metin biter).
function parseSpecs(raw) {
  const toks = raw.split(/\s+/).filter(Boolean);
  const isPath = (t) => /^(\/|\.\/|https?:\/\/)/.test(t);
  const out = [];
  let cur = null;
  for (const t of toks) {
    const ci = t.indexOf("::");
    if (ci !== -1) {
      if (cur) out.push(cur);
      cur = { path: t.slice(0, ci), expect: t.slice(ci + 2) };
    } else if (cur && typeof cur.expect === "string" && !isPath(t)) {
      cur.expect += " " + t;
    } else {
      if (cur) out.push(cur);
      cur = { path: t, expect: null };
    }
  }
  if (cur) out.push(cur);
  return out.map((s) => ({
    path: s.path,
    expect: typeof s.expect === "string" ? s.expect.trim() || null : null,
  }));
}
const specs = parseSpecs(RAW_URLS);
if (specs.length === 0) specs.push({ path: "/", expect: null });

function resolveUrl(p) {
  try {
    return new URL(p, BASE).toString();
  } catch {
    return null;
  }
}

function fmtConsole(p) {
  const parts = (p.args || []).map((a) =>
    a && a.value !== undefined
      ? String(a.value)
      : (a && (a.description || a.type)) || "?",
  );
  return parts.join(" ").slice(0, 200) || "(console.error)";
}
function fmtException(p) {
  const d = (p && p.exceptionDetails) || {};
  const ex = d.exception || {};
  return String(
    ex.description || ex.value || d.text || "Yakalanmamış exception",
  ).slice(0, 200);
}

// favicon.ico neredeyse her statik sunucuda 404 döner ve sayfa hatası
// sayılmaz — bilinen tek istisna, bilinçli olarak elenir.
function isIgnorableReq(url) {
  return /\/favicon\.ico(\?|$)/.test(url || "");
}

async function checkUrl(spec) {
  const full = resolveUrl(spec.path);
  const v = {
    consoleErr: [],
    exceptions: [],
    logErr: [],
    netFail: [],
    missingText: null,
    error: null,
  };
  if (!full) {
    v.error = `URL çözülemedi: ${spec.path}`;
    return { url: spec.path, v, count: 1 };
  }

  // Sekmeyi about:blank ile aç, domainleri aç, SONRA Page.navigate et. Sekmeyi
  // doğrudan hedef URL'de açarsak sayfa iki kez yüklenir (bir kez oluşturmada,
  // bir kez navigate'te) ve konsol/exception olayları çift sayılır.
  let created;
  try {
    created = await fetchJson(`${CDP}/json/new?about:blank`, { method: "PUT" });
    if (!created.json || !created.json.webSocketDebuggerUrl) {
      // Bazı eski Chrome yapıları GET ister.
      created = await fetchJson(`${CDP}/json/new?about:blank`);
    }
  } catch (e) {
    v.error = `sekme açılamadı: ${e.message}`;
    return { url: full, v, count: 1 };
  }
  if (!created.json || !created.json.webSocketDebuggerUrl) {
    v.error = "sekme açılamadı (webSocketDebuggerUrl yok)";
    return { url: full, v, count: 1 };
  }

  const targetId = created.json.id;
  let ws;
  try {
    ws = await openWs(created.json.webSocketDebuggerUrl);
  } catch (e) {
    try {
      await fetchJson(`${CDP}/json/close/${targetId}`);
    } catch {
      /* yok say */
    }
    v.error = `CDP soketi açılamadı: ${e.message}`;
    return { url: full, v, count: 1 };
  }

  const client = new CDPClient(ws);
  let loadedResolve;
  const loaded = new Promise((r) => (loadedResolve = r));

  client.on((msg) => {
    const p = msg.params || {};
    switch (msg.method) {
      case "Runtime.consoleAPICalled":
        if (p.type === "error") v.consoleErr.push(fmtConsole(p));
        break;
      case "Runtime.exceptionThrown":
        v.exceptions.push(fmtException(p));
        break;
      case "Log.entryAdded":
        // source:"network" girdileri Network.* olaylarıyla birebir tekrar —
        // orada favicon vb. elendiği için burada tümden atlıyoruz.
        if (
          p.entry &&
          p.entry.level === "error" &&
          p.entry.source !== "network"
        )
          v.logErr.push(String(p.entry.text || "(log error)").slice(0, 200));
        break;
      case "Network.responseReceived":
        if (
          p.response &&
          p.response.status >= 400 &&
          !isIgnorableReq(p.response.url)
        )
          v.netFail.push(`${p.response.status} ${p.response.url}`.slice(0, 200));
        break;
      case "Network.loadingFailed":
        if (
          !p.canceled &&
          !(p.request && isIgnorableReq(p.request.url))
        )
          v.netFail.push(
            `${p.errorText || "istek başarısız"} ${
              (p.request && p.request.url) || ""
            }`
              .trim()
              .slice(0, 200),
          );
        break;
      case "Page.loadEventFired":
        loadedResolve();
        break;
    }
  });

  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Log.enable");
    await client.send("Page.navigate", { url: full });
    await Promise.race([loaded, sleep(LOAD_TIMEOUT_MS)]);
    await sleep(SETTLE_MS);

    if (spec.expect) {
      try {
        const r = await client.send("Runtime.evaluate", {
          expression:
            "(document.body && document.body.innerText) ? document.body.innerText : ''",
          returnByValue: true,
        });
        const txt =
          r && r.result && typeof r.result.value === "string"
            ? r.result.value
            : "";
        if (!txt.includes(spec.expect)) v.missingText = spec.expect;
      } catch {
        v.missingText = spec.expect;
      }
    }
  } catch (e) {
    v.error = `gezinme hatası: ${e.message}`;
  }

  try {
    ws.close();
  } catch {
    /* yok say */
  }
  try {
    await fetchJson(`${CDP}/json/close/${targetId}`);
  } catch {
    /* yok say */
  }

  const count =
    v.consoleErr.length +
    v.exceptions.length +
    v.logErr.length +
    v.netFail.length +
    (v.missingText ? 1 : 0) +
    (v.error ? 1 : 0);
  return { url: full, v, count };
}

function cap(arr, n) {
  return arr.length > n ? arr.slice(0, n).concat([`… (+${arr.length - n})`]) : arr;
}

async function main() {
  if (!(await waitForCdp(CDP, CDP_READY_TIMEOUT_MS)))
    fail(`SMOKE FAIL: Chrome CDP ${PORT} hazır olmadı`);

  const results = [];
  for (const spec of specs) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await checkUrl(spec));
  }

  const bad = results.filter((r) => r.count > 0);
  if (bad.length === 0) {
    console.log(`smoke: ${results.length} URL temiz`);
    process.exit(0);
  }

  const first = bad[0];
  const n = first.v.consoleErr.length + first.v.logErr.length;
  const m = first.v.netFail.length;
  const k = first.v.exceptions.length;
  let line = `SMOKE FAIL: ${first.url} (${n} console err, ${m} net fail, ${k} exception`;
  if (first.v.missingText) line += `, "${first.v.missingText}" metni yok`;
  if (first.v.error) line += `, ${first.v.error}`;
  line += ")";
  console.log(line);

  console.log("─────────────────────────────");
  for (const r of results) {
    if (r.count === 0) {
      console.log(`  ✓ ${r.url}  temiz`);
      continue;
    }
    const tags = [];
    if (r.v.consoleErr.length) tags.push(`${r.v.consoleErr.length} console err`);
    if (r.v.logErr.length) tags.push(`${r.v.logErr.length} log err`);
    if (r.v.netFail.length) tags.push(`${r.v.netFail.length} net fail`);
    if (r.v.exceptions.length) tags.push(`${r.v.exceptions.length} exception`);
    if (r.v.missingText) tags.push(`metin yok: "${r.v.missingText}"`);
    if (r.v.error) tags.push(r.v.error);
    console.log(`  ✗ ${r.url}  ${tags.join(", ")}`);
    for (const e of cap(r.v.consoleErr, 3)) console.log(`      console: ${e}`);
    for (const e of cap(r.v.logErr, 3)) console.log(`      log: ${e}`);
    for (const e of cap(r.v.exceptions, 3)) console.log(`      exception: ${e}`);
    for (const e of cap(r.v.netFail, 5)) console.log(`      net: ${e}`);
  }
  process.exit(1);
}

main().catch((e) => {
  fail(`SMOKE FAIL: beklenmeyen hata — ${e && e.message ? e.message : e}`);
});
