import { lintSource } from "@secretlint/core";
import { creator as recommended } from "@secretlint/secretlint-rule-preset-recommend";

/**
 * Best-effort secret redaction. The skill already tells the agent not to record
 * secrets; this is the safety net before anything is written or rendered.
 * Two layers: our own patterns for passwords typed on a command line, which no
 * provider ruleset knows, and secretlint's maintained rules for provider tokens.
 */
const MASK = "[REDACTED]";

const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, // OpenAI-style
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{22,}/g,
  /\bglpat-[A-Za-z0-9_-]{20,}/g, // GitLab
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, // AWS access key id
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bnpm_[A-Za-z0-9]{36}\b/g, // npm
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API key
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
];

/**
 * Keeps the label, masks the value: `password=hunter2!x` → `password=[REDACTED]`.
 * The label may carry a prefix (`PGPASSWORD`, `DB_PASSWORD`) and, for AWS, the
 * `_access_key` suffix. The value must look like a credential (8+ chars with a
 * digit or symbol), so prose such as "token: refresh flow" is left alone.
 */
const ASSIGNMENT =
  /\b(\w*?(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)(?:_access_key)?\s*[:=]\s*)(["']?)(?=[^\s"',;]*[0-9_\-+/!@#$%^&*])[^\s"',;]{8,}\2/gi;
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/-]{16,}=*/g;
const BASIC = /\b(Authorization:\s*Basic\s+)[A-Za-z0-9+/]{8,}={0,2}/gi;

/** A flag's value: quoted, spaces and all, or one bare word. */
const VALUE = String.raw`(?:(["'])[^"'\n]+\2|[^\s"']+)`;
/** A bare value that looks like a credential, as in ASSIGNMENT. */
const CREDENTIAL = String.raw`(?:(["'])[^"'\n]+\2|(?=[^\s"']*[0-9_\-+/!@#$%^&*])[^\s"']{6,})`;

/** A few more arguments of the same command: no `;`, `&`, `|` or line break between. */
const SAME_COMMAND = String.raw`(?:\s+[^\s;&|]+){0,8}?`;

/** Passwords typed as command arguments; the first group is kept. */
const COMMAND_LINE: RegExp[] = [
  // `mysql -pSECRET`; with a space after -p, mysql asks instead.
  new RegExp(
    String.raw`(\b(?:mysql|mariadb|mysqldump|mysqladmin|mysqlimport|mysqlshow)${SAME_COMMAND}\s-p)${VALUE}`,
    "g",
  ),
  new RegExp(String.raw`(\bsshpass\s+-p\s*)${VALUE}`, "g"),
  new RegExp(
    String.raw`((?:\s--(?:password|passwd|token|secret|api-key|access-token|client-secret)|\baws_secret_access_key)\s+)${CREDENTIAL}`,
    "gi",
  ),
];
/** `curl -u user:SECRET`, quoted or not: the user stays. */
const CURL_USER = new RegExp(
  String.raw`(\bcurl${SAME_COMMAND}\s(?:-u|--user)\s*)(?:(["'])([^:"'\n]+:)[^"'\n]+\2|([^\s:"']+:)[^\s"']+)`,
  "g",
);
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi;

export function redactText(text: string): { text: string; count: number } {
  let count = 0;
  const hit = () => {
    count++;
    return MASK;
  };
  let out = text;
  for (const re of PATTERNS) out = out.replace(re, hit);
  out = out.replace(ASSIGNMENT, (_m, label: string, q: string) => `${label}${q}${hit()}${q}`);
  out = out.replace(BEARER, (_m, label: string) => `${label}${hit()}`);
  out = out.replace(BASIC, (_m, label: string) => `${label}${hit()}`);
  for (const re of COMMAND_LINE)
    out = out.replace(re, (_m, prefix: string, q: string | undefined) =>
      q === undefined ? `${prefix}${hit()}` : `${prefix}${q}${hit()}${q}`,
    );
  out = out.replace(
    CURL_USER,
    (_m, prefix: string, q: string | undefined, quotedUser: string, bareUser: string) =>
      q === undefined ? `${prefix}${bareUser}${hit()}` : `${prefix}${q}${quotedUser}${hit()}${q}`,
  );
  out = out.replace(URL_CREDENTIALS, (_m, prefix: string) => `${prefix}${hit()}@`);
  return { text: out, count };
}

/** Applies `f` to every string inside a JSON-like value, in a fixed order. */
function mapStrings(value: unknown, f: (text: string) => string): unknown {
  if (typeof value === "string") return f(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, f)]));
  return value;
}

const SECRETLINT = {
  rules: [{ id: "@secretlint/secretlint-rule-preset-recommend", rule: recommended }],
};
/** URLs with a password: ours masks only the password and keeps the user and host. */
const OURS = new Set([
  "@secretlint/secretlint-rule-basicauth",
  "@secretlint/secretlint-rule-database-connection-string",
]);
/** Joins the strings for one secretlint run; no token spans it. */
const SEPARATOR = "\n\u0000\n";

/** Masks the provider tokens secretlint finds, in one run over all the strings. */
async function maskProviderTokens(texts: string[]): Promise<{ texts: string[]; count: number }> {
  if (texts.length === 0) return { texts, count: 0 };
  const result = await lintSource({
    source: { filePath: "record.txt", content: texts.join(SEPARATOR), contentType: "text" },
    options: { config: SECRETLINT },
  });
  const ranges = result.messages.filter((m) => !OURS.has(m.ruleId)).map((m) => m.range);
  if (ranges.length === 0) return { texts, count: 0 };
  let count = 0;
  let start = 0;
  const out = texts.map((text) => {
    const end = start + text.length;
    // Last first, so earlier offsets still hold; a range two rules both found counts once.
    const inside = ranges.filter(([a, b]) => a >= start && b <= end).sort((x, y) => y[0] - x[0]);
    let masked = text;
    let before = Number.POSITIVE_INFINITY;
    for (const [a, b] of inside) {
      if (b > before) continue;
      masked = `${masked.slice(0, a - start)}${MASK}${masked.slice(b - start)}`;
      before = a;
      count++;
    }
    start = end + SEPARATOR.length;
    return masked;
  });
  return { texts: out, count };
}

/** Redacts every string inside a JSON-like value. */
export async function redactDeep<T>(value: T): Promise<{ value: T; count: number }> {
  let count = 0;
  const texts: string[] = [];
  const ours = mapStrings(value, (text) => {
    const r = redactText(text);
    count += r.count;
    texts.push(r.text);
    return r.text;
  });
  const providers = await maskProviderTokens(texts);
  let i = 0;
  const masked = mapStrings(ours, () => providers.texts[i++] as string);
  return { value: masked as T, count: count + providers.count };
}
