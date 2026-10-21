/**
 * Best-effort secret redaction. The skill already tells the agent not to record
 * secrets; this is the safety net before anything is written or rendered.
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
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API key
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
];

/**
 * Keeps the label, masks the value: `password=hunter2!x` → `password=[REDACTED]`.
 * The value must look like a credential (8+ chars with a digit or symbol), so
 * prose such as "token: refresh flow" is left alone.
 */
const ASSIGNMENT =
  /\b((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*)(["']?)(?=[^\s"',;]*[0-9_\-+/!@#$%^&*])[^\s"',;]{8,}\2/gi;
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/-]{16,}=*/g;
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
  out = out.replace(URL_CREDENTIALS, (_m, prefix: string) => `${prefix}${hit()}@`);
  return { text: out, count };
}

/** Redacts every string inside a JSON-like value. */
export function redactDeep<T>(value: T): { value: T; count: number } {
  let count = 0;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = redactText(v);
      count += r.count;
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return { value: walk(value) as T, count };
}
