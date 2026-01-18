import Conf from "conf";
import { homedir } from "os";
import { join } from "path";

// OpenCode plugin types (inline to avoid strict dependency on @opencode-ai/plugin)
interface PluginClient {
  app: {
    log: (entry: {
      service: string;
      level: "debug" | "info" | "warn" | "error";
      message: string;
      extra?: Record<string, unknown>;
    }) => Promise<void>;
  };
}

interface PluginContext {
  project: unknown;
  client: PluginClient;
  $: unknown;
  directory: string;
  worktree: string;
}

interface PluginEvent {
  type: string;
  properties?: Record<string, unknown>;
}

interface PluginHooks {
  event?: (input: { event: PluginEvent }) => Promise<void>;
}

type Plugin = (ctx: PluginContext) => Promise<PluginHooks>;

// Config type for API Key authentication
interface Config {
  convexUrl: string;
  apiKey: string;
}

// Lazy-loaded config to avoid blocking module initialization
let _config: Conf<Config> | null = null;

function getConfInstance(): Conf<Config> {
  if (!_config) {
    _config = new Conf<Config>({
      projectName: "opencode-sync",
      cwd: join(homedir(), ".config", "opencode-sync"),
      configName: "config",
    });
  }
  return _config;
}

// Types for OpenCode session and message data
interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
}

// Message content part types
interface TextPart {
  type: "text";
  text: string;
}

interface ToolCallPart {
  type: "tool_use" | "tool-call";
  name: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
}

interface ToolResultPart {
  type: "tool_result" | "tool-result";
  content?: unknown;
  result?: unknown;
}

interface GenericPart {
  type: string;
  [key: string]: unknown;
}

type MessagePart = TextPart | ToolCallPart | ToolResultPart | GenericPart;
type MessageContent = string | MessagePart[];

// Extracted part for storage
interface ExtractedPart {
  type: string;
  content: string | Record<string, unknown>;
}

// OpenCode message structure
interface OpenCodeMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: MessageContent;
  model?: string;
  usage?: TokenUsage;
  duration?: number;
  status?: "pending" | "streaming" | "completed" | "error";
}

// OpenCode session structure
interface OpenCodeSession {
  id: string;
  title?: string;
  cwd?: string;
  model?: string;
  provider?: string;
  usage?: TokenUsage;
  messages?: OpenCodeMessage[];
}

// Config getters/setters for CLI
export function getConfig(): Config | null {
  const conf = getConfInstance();
  const url = conf.get("convexUrl");
  const key = conf.get("apiKey");
  if (!url) return null;
  return { convexUrl: url, apiKey: key || "" };
}

export function setConfig(cfg: Config) {
  const conf = getConfInstance();
  conf.set("convexUrl", cfg.convexUrl);
  conf.set("apiKey", cfg.apiKey);
}

export function clearConfig() {
  const conf = getConfInstance();
  conf.clear();
}

// Get API key for authentication
function getApiKey(): string | null {
  const cfg = getConfig();
  if (!cfg || !cfg.apiKey) return null;
  return cfg.apiKey;
}

// Normalize URL to .site format for HTTP endpoints
// Accepts both .convex.cloud and .convex.site formats
function normalizeToSiteUrl(url: string): string {
  if (url.includes(".convex.cloud")) {
    return url.replace(".convex.cloud", ".convex.site");
  }
  // Already .site or other format, return as-is
  return url;
}

// Get site URL for API calls
function getSiteUrl(): string | null {
  const cfg = getConfig();
  if (!cfg || !cfg.convexUrl) return null;
  return normalizeToSiteUrl(cfg.convexUrl);
}

// Sync session data to backend
async function syncSession(session: OpenCodeSession, client: PluginClient) {
  const apiKey = getApiKey();
  const siteUrl = getSiteUrl();

  if (!apiKey || !siteUrl) {
    await client.app.log({
      service: "opencode-sync",
      level: "warn",
      message: "Not authenticated. Run: opencode-sync login",
    });
    return;
  }

  try {
    const response = await fetch(`${siteUrl}/sync/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
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
    });

    if (!response.ok) {
      const errorText = await response.text();
      await client.app.log({
        service: "opencode-sync",
        level: "error",
        message: `Session sync failed: ${errorText}`,
      });
    }
  } catch (e) {
    await client.app.log({
      service: "opencode-sync",
      level: "error",
      message: `Session sync error: ${e}`,
    });
  }
}

// Sync message data to backend
async function syncMessage(sessionId: string, message: OpenCodeMessage, client: PluginClient) {
  const apiKey = getApiKey();
  const siteUrl = getSiteUrl();

  if (!apiKey || !siteUrl) return;

  const parts = extractParts(message.content);

  try {
    const response = await fetch(`${siteUrl}/sync/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
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
        parts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await client.app.log({
        service: "opencode-sync",
        level: "error",
        message: `Message sync failed: ${errorText}`,
      });
    }
  } catch (e) {
    await client.app.log({
      service: "opencode-sync",
      level: "error",
      message: `Message sync error: ${e}`,
    });
  }
}

// Extract title from first user message
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

// Extract text from message content
function extractTextContent(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is TextPart => p.type === "text")
      .map((p) => p.text)
      .join("\n");
  }
  return "";
}

// Extract parts from message content for structured storage
function extractParts(content: MessageContent): ExtractedPart[] {
  if (typeof content === "string") {
    return [{ type: "text", content }];
  }

  if (Array.isArray(content)) {
    return content.map((part): ExtractedPart => {
      if (part.type === "text") {
        return { type: "text", content: (part as TextPart).text };
      }
      if (part.type === "tool_use" || part.type === "tool-call") {
        const toolPart = part as ToolCallPart;
        return {
          type: "tool-call",
          content: { name: toolPart.name, args: toolPart.input || toolPart.args || {} },
        };
      }
      if (part.type === "tool_result" || part.type === "tool-result") {
        const resultPart = part as ToolResultPart;
        return {
          type: "tool-result",
          content: { result: resultPart.content || resultPart.result },
        };
      }
      return { type: part.type, content: part as Record<string, unknown> };
    });
  }

  return [];
}

// Track synced messages to avoid duplicates
const syncedMessages = new Set<string>();
const syncedSessions = new Set<string>();

/**
 * OpenCode Sync Plugin
 * Syncs sessions and messages to cloud storage via Convex backend
 * Authentication: API Key (osk_*) from OpenSync Settings page
 */
export const OpenCodeSyncPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  const cfg = getConfig();
  
  if (!cfg || !cfg.apiKey) {
    await client.app.log({
      service: "opencode-sync",
      level: "warn",
      message: "Not configured. Run: opencode-sync login",
    });
  } else {
    await client.app.log({
      service: "opencode-sync",
      level: "info",
      message: "Plugin initialized",
      extra: { directory, worktree },
    });
  }

  return {
    // Handle all events via generic event handler
    event: async ({ event }) => {
      const props = event.properties as Record<string, unknown> | undefined;

      // Session created - sync initial session data
      if (event.type === "session.created") {
        const session = props as OpenCodeSession | undefined;
        if (session?.id && !syncedSessions.has(session.id)) {
          syncedSessions.add(session.id);
          await syncSession(session, client);
        }
      }

      // Session updated - sync updated session data
      if (event.type === "session.updated") {
        const session = props as OpenCodeSession | undefined;
        if (session?.id) {
          await syncSession(session, client);
        }
      }

      // Session idle - final sync when session completes
      if (event.type === "session.idle") {
        const session = props as OpenCodeSession | undefined;
        if (session?.id) {
          await syncSession(session, client);
        }
      }

      // Message updated - sync message data
      if (event.type === "message.updated") {
        const messageProps = props as { sessionId?: string; message?: OpenCodeMessage } | undefined;
        const sessionId = messageProps?.sessionId;
        const message = messageProps?.message;
        if (sessionId && message?.id && !syncedMessages.has(message.id)) {
          syncedMessages.add(message.id);
          await syncMessage(sessionId, message, client);
        }
      }

      // Message part updated - sync partial message updates
      if (event.type === "message.part.updated") {
        const messageProps = props as { sessionId?: string; message?: OpenCodeMessage } | undefined;
        const sessionId = messageProps?.sessionId;
        const message = messageProps?.message;
        if (sessionId && message?.id) {
          // Only sync completed messages (not streaming)
          if (message.status === "completed" || message.role === "user") {
            if (!syncedMessages.has(message.id)) {
              syncedMessages.add(message.id);
              await syncMessage(sessionId, message, client);
            }
          }
        }
      }
    },
  };
};
