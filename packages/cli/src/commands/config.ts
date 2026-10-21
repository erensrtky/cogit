import { CliError, type Io } from "../io.js";
import { Config } from "../schema/config.js";
import { loadConfig, updateConfig } from "../store/stores.js";

export const CONFIG_KEYS = Object.keys(Config.shape).filter((k) => k !== "schema") as Exclude<
  keyof Config,
  "schema"
>[];

function assertKey(key: string): asserts key is (typeof CONFIG_KEYS)[number] {
  if (!(CONFIG_KEYS as string[]).includes(key)) {
    throw new CliError(`unknown key "${key}"; one of: ${CONFIG_KEYS.join(", ")}`);
  }
}

/** Command-line text to a value: JSON when it parses, comma lists for arrays, else a string. */
function parseValue(key: string, raw: string): unknown {
  if (key === "agents" && !raw.trim().startsWith("[")) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function configGet(key: string | undefined, io: Io): Promise<void> {
  const config = await loadConfig(io.env);
  if (key === undefined) {
    for (const k of CONFIG_KEYS) io.out(`${k} = ${JSON.stringify(config[k])}`);
    return;
  }
  assertKey(key);
  io.out(JSON.stringify(config[key]));
}

export async function configSet(key: string, raw: string, io: Io): Promise<void> {
  assertKey(key);
  const value = parseValue(key, raw);
  const next = Config.safeParse({ ...(await loadConfig(io.env)), [key]: value });
  if (!next.success) {
    throw new CliError(`invalid value for ${key}: ${next.error.issues[0]?.message ?? "rejected"}`);
  }
  await updateConfig((c) => ({ ...c, [key]: next.data[key] }), io.env);
  io.out(`${key} = ${JSON.stringify(next.data[key])}`);
}
