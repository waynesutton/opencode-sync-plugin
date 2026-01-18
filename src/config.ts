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
