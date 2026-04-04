import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

export interface ApiKey {
  key: string;
  name: string;
  active: boolean;
}

interface ApiKeysFile {
  keys: ApiKey[];
}

const KEYS_PATH = process.env.API_KEYS_PATH
  || resolve(homedir(), ".secrets", "argentina-data-mcp-keys.json");
const RELOAD_INTERVAL_MS = 60_000; // Re-check file every 60s

let cachedKeys: ApiKey[] = [];
let lastMtime = 0;
let lastCheck = 0;

function loadKeysFromDisk(): ApiKey[] {
  try {
    const stat = statSync(KEYS_PATH);
    const mtime = stat.mtimeMs;

    if (mtime === lastMtime && cachedKeys.length > 0) {
      return cachedKeys;
    }

    const raw = readFileSync(KEYS_PATH, "utf-8");
    const data: ApiKeysFile = JSON.parse(raw);

    if (!Array.isArray(data.keys)) {
      console.error(`[auth] Invalid keys file format: expected { keys: [...] }`);
      return cachedKeys;
    }

    cachedKeys = data.keys;
    lastMtime = mtime;
    console.log(`[auth] Loaded ${cachedKeys.filter((k) => k.active).length} active API keys`);
    return cachedKeys;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      console.warn(`[auth] No API keys file found at ${KEYS_PATH} — API key auth disabled`);
    } else {
      console.error(`[auth] Error reading API keys:`, err.message);
    }
    return cachedKeys;
  }
}

function getKeys(): ApiKey[] {
  const now = Date.now();
  if (now - lastCheck > RELOAD_INTERVAL_MS) {
    lastCheck = now;
    return loadKeysFromDisk();
  }
  return cachedKeys;
}

export function validateApiKey(token: string): boolean {
  const keys = getKeys();
  return keys.some((k) => k.active && k.key === token);
}

// Force initial load
loadKeysFromDisk();
