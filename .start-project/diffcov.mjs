// .start-project/diffcov.mjs — değişen-satır (diff) coverage gate.
// unit testleri `--coverage` ile koşulduktan SONRA `./qa` bunu çağırır: `git diff`
// + untracked ile değişen kaynak satırlarını, coverage raporuyla (lcov / clover /
// cobertura) kesiştirir; kaplanmamış değişen satır varsa exit 1 → Ralph story'yi
// kapatamaz. Sadece DEĞİŞEN satırlara bakar — eski kapsamsız kod görünmez
// (baseline gerekmez). Harici bağımlılık YOK (Node ≥21). BU dosya `start-project
// --update` ile yeniden üretilir — elle düzenleme kalıcı olmaz.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

// ── args ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), "1"];
  }),
);
const MIN = Number(args.min || "100");
const LCOV_ARG = (args.lcov || "").trim();
const BASE_ARG = (args.base || "").trim();
const EXCLUDE_ARG = (args.exclude || "").trim();
const ROOT = process.cwd();

function die(code, msg) {
  process.stdout.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

// ── kaynak dosya filtresi ────────────────────────────────────────────────
const SRC_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|vue|php|py)$/;
const EXCLUDE = [
  /(^|\/)\.start-project\//,
  /(^|\/)(node_modules|vendor|dist|build|coverage|out|storybook-static)\//,
  /(^|\/)\.(git|next|nuxt|turbo|svelte-kit|vercel|output)\//,
  /(^|\/)(tests?|__tests__|__mocks__|e2e|cypress|playwright)\//,
  /\.(test|spec|stories|d)\.[cm]?[jt]sx?$/,
  /(^|\/)(test_[^/]*|[^/]*_test|conftest)\.py$/,
  /(^|\/)(\.venv|venv|__pycache__|\.tox|site-packages)\//,
  /(^|\/)migrations\/[^/]*\.py$/,
  /(^|\/)database\/migrations\//,
  /(^|\/)public\//,
  /(^|\/)bootstrap\/(ssr|cache)\//,
  /\.config\.[cm]?[jt]s$/,
  /(^|\/)(vite|vitest|rollup|webpack|jest|tailwind|postcss|eslint|prettier)\.config\./,
];
const userExcl = EXCLUDE_ARG
  ? EXCLUDE_ARG.split(/[\s,]+/)
      .filter(Boolean)
      .map((g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"))
  : [];

function isSource(p) {
  if (!SRC_EXT.test(p)) return false;
  if (EXCLUDE.some((re) => re.test(p))) return false;
  if (userExcl.some((re) => re.test(p))) return false;
  return true;
}

// ── git: değişen satırlar ────────────────────────────────────────────────
function git(a) {
  return execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
try {
  git(["rev-parse", "--is-inside-work-tree"]);
} catch {
  die(2, "diffcov: git repo değil — atlanamaz, QA_DIFFCOV=0 ile kapat");
}

function diffRanges(range) {
  let out;
  try {
    out = git(["diff", "--unified=0", "--no-color", "--diff-filter=d", ...range]);
  } catch {
    return {};
  }
  const files = {};
  let cur = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).replace(/^b\//, "").trim();
      cur = p === "/dev/null" ? null : p;
      if (cur) files[cur] = files[cur] || new Set();
      continue;
    }
    if (cur && line.startsWith("@@")) {
      const m = line.match(/\+(\d+)(?:,(\d+))?/);
      if (!m) continue;
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      for (let i = 0; i < count; i++) files[cur].add(start + i);
    }
  }
  return files;
}

function mergeInto(dst, src) {
  for (const [f, set] of Object.entries(src)) {
    dst[f] = dst[f] || new Set();
    for (const l of set) dst[f].add(l);
  }
}

const changed = {};
if (BASE_ARG) {
  mergeInto(changed, diffRanges([BASE_ARG]));
} else {
  mergeInto(changed, diffRanges(["HEAD"])); // working tree + index vs HEAD
  try {
    git(["rev-parse", "--verify", "--quiet", "HEAD~1"]);
    mergeInto(changed, diffRanges(["HEAD~1", "HEAD"])); // Ralph story commit'i
  } catch {
    /* ilk commit — HEAD~1 yok */
  }
}
// untracked (yeni) dosyalar: git diff bunları göstermez → tüm satırları "değişen" say
if (!BASE_ARG) {
  try {
    for (const f of git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)) {
      if (!isSource(f)) continue;
      let n;
      try {
        n = readFileSync(path.resolve(ROOT, f), "utf8").split("\n").length;
      } catch {
        continue;
      }
      const set = (changed[f] = changed[f] || new Set());
      for (let i = 1; i <= n; i++) set.add(i);
    }
  } catch {
    /* ignore */
  }
}

const srcChanged = Object.fromEntries(Object.entries(changed).filter(([f]) => isSource(f)));
if (Object.keys(srcChanged).length === 0) {
  die(0, "diffcov: değişen kaynak dosyası yok — atlandı");
}

// ── coverage raporu ─────────────────────────────────────────────────────
const candidates = LCOV_ARG
  ? [LCOV_ARG]
  : ["coverage/lcov.info", "coverage/clover.xml", "coverage/cobertura-coverage.xml", "coverage/coverage-clover.xml"];
const reportPath = candidates.map((c) => path.resolve(ROOT, c)).find((c) => existsSync(c));
if (!reportPath) {
  die(
    2,
    `diffcov: coverage raporu bulunamadı (${candidates.join(", ")}) — ` +
      `unit --coverage üretmiyor. QA_DIFFCOV_LCOV / QA_DIFFCOV_UNIT_CMD ayarla ya da QA_DIFFCOV=0`,
  );
}
const raw = readFileSync(reportPath, "utf8");

// dosya yolu normalize: mutlak → ROOT'a göreli
function norm(p) {
  let n = p.replace(/\\/g, "/").trim();
  if (path.isAbsolute(n)) n = path.relative(ROOT, n).replace(/\\/g, "/");
  return n.replace(/^\.\//, "").replace(/^b\//, "");
}

// coverage: { normPath: Map<lineNo, hits> }
const cov = {};
function covSet(file, line, hits) {
  const k = norm(file);
  (cov[k] = cov[k] || new Map()).set(line, (cov[k].get(line) || 0) + hits);
}

if (/^\s*</.test(raw) || reportPath.endsWith(".xml")) {
  // clover:    <file name|path="..."> <line num="N" count="C" .../>
  // cobertura: <class filename="...">  <line number="N" hits="H" .../>
  const fileRe = /<(?:file|class)\b[^>]*\b(?:name|path|filename)="([^"]+)"[^>]*>([\s\S]*?)<\/(?:file|class)>/g;
  let fm;
  while ((fm = fileRe.exec(raw))) {
    const fname = fm[1];
    const lineRe = /<line\b[^>]*\b(?:num|number)="(\d+)"[^>]*\b(?:count|hits)="(\d+)"[^>]*\/?>/g;
    let lm;
    while ((lm = lineRe.exec(fm[2]))) covSet(fname, Number(lm[1]), Number(lm[2]));
  }
} else {
  // lcov: SF:<path> ... DA:<line>,<hits> ... end_of_record
  let sf = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("SF:")) sf = line.slice(3).trim();
    else if (line.startsWith("DA:") && sf) {
      const [ln, hits] = line.slice(3).split(",");
      covSet(sf, Number(ln), Number(hits || "0"));
    } else if (line.startsWith("end_of_record")) sf = null;
  }
}

// coverage anahtarını değişen dosya yoluna eşle (exact → suffix → tekil basename)
const covKeys = Object.keys(cov);
function covFor(file) {
  const n = norm(file);
  if (cov[n]) return cov[n];
  const suf = covKeys.find((k) => k.endsWith("/" + n) || n.endsWith("/" + k));
  if (suf) return cov[suf];
  const base = n.split("/").pop();
  const baseHits = covKeys.filter((k) => k.split("/").pop() === base);
  return baseHits.length === 1 ? cov[baseHits[0]] : null;
}

// ── kesişim + karar ─────────────────────────────────────────────────────
function compress(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const out = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j + 1;
  }
  return out.join(", ");
}

// instrument edilmemiş dosyada "çalıştırılabilir görünen" değişen satır var mı?
const NONEXEC = /^\s*(\/\/|\/\*|\*|#|import\b|from\s+\S+\s+import\b|export\s+(type|interface)\b|type\s|interface\s|[}{)\];,:]*\s*$)/;
function looksExecutable(file, lineNos) {
  let text;
  try {
    text = readFileSync(path.resolve(ROOT, file), "utf8").split("\n");
  } catch {
    return true;
  }
  return [...lineNos].some((ln) => {
    const src = text[ln - 1];
    return src !== undefined && src.trim() !== "" && !NONEXEC.test(src);
  });
}

let totalInstr = 0;
let totalCovered = 0;
const problems = [];

for (const [file, lineSet] of Object.entries(srcChanged)) {
  const cmap = covFor(file);
  if (!cmap) {
    if (looksExecutable(file, lineSet))
      problems.push(`  ${file}: dosya hiç instrument edilmemiş (hiçbir test çalıştırmıyor)`);
    continue;
  }
  const instrChanged = [...lineSet].filter((l) => cmap.has(l));
  if (instrChanged.length === 0) continue; // değişenler çalıştırılabilir değil (yorum/tip)
  const uncovered = instrChanged.filter((l) => (cmap.get(l) || 0) === 0);
  totalInstr += instrChanged.length;
  totalCovered += instrChanged.length - uncovered.length;
  if (uncovered.length) problems.push(`  ${file}: ${compress(uncovered)}`);
}

const hardFail = problems.some((p) => p.includes("instrument edilmemiş"));
if (problems.length === 0 && totalInstr === 0) {
  die(0, "diffcov: değişen çalıştırılabilir satır yok — atlandı");
}

const pct = totalInstr === 0 ? 100 : Math.floor((totalCovered / totalInstr) * 100);
if (hardFail || pct < MIN) {
  const head = [];
  if (pct < MIN) head.push(`${totalInstr - totalCovered}/${totalInstr} değişen satır kapsamsız (%${pct} < %${MIN})`);
  if (hardFail) head.push("instrument edilmemiş kaynak dosya (test çalıştırmıyor)");
  process.stdout.write(`DIFFCOV FAIL: ${head.join("; ")}\n` + problems.join("\n") + "\n");
  process.exit(1);
}
die(0, `diffcov: ${totalCovered}/${totalInstr} değişen satır kaplı (%${pct} ≥ %${MIN})`);
