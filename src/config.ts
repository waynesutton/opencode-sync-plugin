// Config helpers for CLI (separate from plugin to avoid export conflicts)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface Config {
  convexUrl: string;
  apiKey: string;
}

// Use dedicated directory to avoid conflicts with OpenCode's own config
const CONFIG_DIR = join(homedir(), ".opensync");
const CONFIG_FILE = join(CONFIG_DIR, "credentials.json");
const SYNCED_SESSIONS_FILE = join(CONFIG_DIR, "synced-sessions.json");

export function getConfig(): Config | null {
  try {
    if (!existsSync(CONFIG_FILE)) return null;
    const content = readFileSync(CONFIG_FILE, "utf8");
    const config = JSON.parse(content) as Config;
    if (!config || !config.convexUrl) return null;
    return config;
  } catch (e) {
    console.error("Error reading config:", e);
    return null;
  }
}

export function setConfig(cfg: Config): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
  } catch (e) {
    console.error("Error saving config:", e);
  }
}

export function clearConfig(): void {
  try {
    if (existsSync(CONFIG_FILE)) {
      writeFileSync(CONFIG_FILE, "{}", "utf8");
    }
  } catch (e) {
    console.error("Error clearing config:", e);
  }
}

// Get list of locally tracked synced session IDs
export function getSyncedSessions(): Set<string> {
  try {
    if (!existsSync(SYNCED_SESSIONS_FILE)) return new Set();
    const content = readFileSync(SYNCED_SESSIONS_FILE, "utf8");
    const data = JSON.parse(content);
    return new Set(Array.isArray(data.sessionIds) ? data.sessionIds : []);
  } catch {
    return new Set();
  }
}

// Add session IDs to local tracking file
export function addSyncedSessions(sessionIds: string[]): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const existing = getSyncedSessions();
    for (const id of sessionIds) {
      existing.add(id);
    }
    const data = { sessionIds: Array.from(existing), lastUpdated: Date.now() };
    writeFileSync(SYNCED_SESSIONS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("Error saving synced sessions:", e);
  }
}

// Clear local tracking file
export function clearSyncedSessions(): void {
  try {
    if (existsSync(SYNCED_SESSIONS_FILE)) {
      writeFileSync(SYNCED_SESSIONS_FILE, JSON.stringify({ sessionIds: [], lastUpdated: Date.now() }), "utf8");
    }
  } catch (e) {
    console.error("Error clearing synced sessions:", e);
  }
}
