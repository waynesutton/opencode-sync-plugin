// Minimal OpenCode Sync Plugin - Testing version

// Config type for API Key authentication
interface Config {
  convexUrl: string;
  apiKey: string;
}

// Lazy-loaded config path to avoid module-load issues
let configDir: string | null = null;
let configFile: string | null = null;

function getConfigPaths() {
  if (!configDir) {
    const { homedir } = require("os");
    const { join } = require("path");
    configDir = join(homedir(), ".config", "opencode-sync");
    configFile = join(configDir, "config.json");
  }
  return { configDir, configFile: configFile! };
}

function readConfigFile(): Config | null {
  try {
    const { existsSync, readFileSync } = require("fs");
    const { configFile } = getConfigPaths();
    if (!existsSync(configFile)) return null;
    const content = readFileSync(configFile, "utf8");
    return JSON.parse(content) as Config;
  } catch {
    return null;
  }
}

function writeConfigFile(config: Config): void {
  try {
    const { existsSync, writeFileSync, mkdirSync } = require("fs");
    const { configDir, configFile } = getConfigPaths();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    writeFileSync(configFile, JSON.stringify(config, null, 2), "utf8");
  } catch {
    // Silently fail
  }
}

// Config getters/setters for CLI
export function getConfig(): Config | null {
  const config = readConfigFile();
  if (!config || !config.convexUrl) return null;
  return config;
}

export function setConfig(cfg: Config): void {
  writeConfigFile(cfg);
}

export function clearConfig(): void {
  try {
    const { existsSync, writeFileSync } = require("fs");
    const { configFile } = getConfigPaths();
    if (existsSync(configFile)) {
      writeFileSync(configFile, "{}", "utf8");
    }
  } catch {
    // Silently fail
  }
}

// Types for message content
type MessageContent = string | Array<{ type: string; text?: string; [key: string]: unknown }>;

interface OpenCodeMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: MessageContent;
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number; cost?: number };
  duration?: number;
  status?: "pending" | "streaming" | "completed" | "error";
}

interface OpenCodeSession {
  id: string;
  title?: string;
  cwd?: string;
  model?: string;
  provider?: string;
  usage?: { promptTokens?: number; completionTokens?: number; cost?: number };
  messages?: OpenCodeMessage[];
}

// Track synced items to avoid duplicates
const syncedMessages = new Set<string>();
const syncedSessions = new Set<string>();

function extractTextContent(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join("\n");
  }
  return "";
}

function extractTitle(session: OpenCodeSession): string {
  const firstMessage = session.messages?.find((m) => m.role === "user");
  if (firstMessage) {
    const text = extractTextContent(firstMessage.content);
    if (text) {
      return text.slice(0, 100) + (text.length > 100 ? "..." : "");
    }
  }
  return "Untitled Session";
}

// Sync functions that run in background (don't await to avoid blocking)
function syncSessionBackground(session: OpenCodeSession): void {
  const config = getConfig();
  if (!config?.apiKey || !config?.convexUrl) return;

  const siteUrl = config.convexUrl.replace(".convex.cloud", ".convex.site");

  fetch(`${siteUrl}/sync/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      externalId: session.id,
      title: session.title || extractTitle(session),
      projectPath: session.cwd,
      projectName: session.cwd?.split("/").pop(),
      model: session.model,
      provider: session.provider,
      promptTokens: session.usage?.promptTokens || 0,
      completionTokens: session.usage?.completionTokens || 0,
      cost: session.usage?.cost || 0,
    }),
  }).catch(() => {
    // Silently fail
  });
}

function syncMessageBackground(sessionId: string, message: OpenCodeMessage): void {
  const config = getConfig();
  if (!config?.apiKey || !config?.convexUrl) return;

  const siteUrl = config.convexUrl.replace(".convex.cloud", ".convex.site");

  fetch(`${siteUrl}/sync/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      sessionExternalId: sessionId,
      externalId: message.id,
      role: message.role,
      textContent: extractTextContent(message.content),
      model: message.model,
      promptTokens: message.usage?.promptTokens,
      completionTokens: message.usage?.completionTokens,
      durationMs: message.duration,
    }),
  }).catch(() => {
    // Silently fail
  });
}

/**
 * OpenCode Sync Plugin
 * Syncs sessions and messages to cloud storage via Convex backend
 */
export const OpenCodeSyncPlugin = async (ctx: {
  client: { app: { log: (entry: { service: string; level: string; message: string }) => Promise<void> } };
  directory: string;
  worktree: string;
}) => {
  // Log initialization (non-blocking)
  ctx.client.app.log({
    service: "opencode-sync",
    level: "info",
    message: "Plugin loaded",
  }).catch(() => {});

  return {
    event: async (input: { event: { type: string; properties?: Record<string, unknown> } }) => {
      try {
        const { event } = input;
        const props = event.properties;

        if (event.type === "session.created" || event.type === "session.updated" || event.type === "session.idle") {
          const session = props as OpenCodeSession | undefined;
          if (session?.id) {
            if (event.type === "session.created" && syncedSessions.has(session.id)) return;
            if (event.type === "session.created") syncedSessions.add(session.id);
            syncSessionBackground(session);
          }
        }

        if (event.type === "message.updated" || event.type === "message.part.updated") {
          const messageProps = props as { sessionId?: string; message?: OpenCodeMessage } | undefined;
          const sessionId = messageProps?.sessionId;
          const message = messageProps?.message;
          
          if (sessionId && message?.id && !syncedMessages.has(message.id)) {
            if (event.type === "message.part.updated" && message.status !== "completed" && message.role !== "user") {
              return;
            }
            syncedMessages.add(message.id);
            syncMessageBackground(sessionId, message);
          }
        }
      } catch {
        // Silently fail to avoid crashing OpenCode
      }
    },
  };
};

export default OpenCodeSyncPlugin;
