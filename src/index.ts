// OpenCode Sync Plugin
// IMPORTANT: Only export the plugin function - no other exports
// OpenCode treats all exports as potential hooks

import { getConfig } from "./config.js";

// Message types
type MessageContent = string | Array<{ type: string; text?: string; [key: string]: unknown }>;

interface OpenCodeMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: MessageContent;
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number; cost?: number };
  duration?: number;
  status?: string;
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

// Dedup sets
const syncedMessages = new Set<string>();
const syncedSessions = new Set<string>();

function extractText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((p) => p.type === "text" && p.text).map((p) => p.text).join("\n");
  }
  return "";
}

function getTitle(session: OpenCodeSession): string {
  const first = session.messages?.find((m) => m.role === "user");
  if (first) {
    const text = extractText(first.content);
    if (text) return text.slice(0, 100) + (text.length > 100 ? "..." : "");
  }
  return "Untitled Session";
}

function doSyncSession(session: OpenCodeSession): void {
  try {
    const config = getConfig();
    if (!config?.apiKey || !config?.convexUrl) return;
    const url = config.convexUrl.replace(".convex.cloud", ".convex.site");
    fetch(`${url}/sync/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        externalId: session.id,
        title: session.title || getTitle(session),
        projectPath: session.cwd,
        projectName: session.cwd?.split("/").pop(),
        model: session.model,
        provider: session.provider,
        promptTokens: session.usage?.promptTokens || 0,
        completionTokens: session.usage?.completionTokens || 0,
        cost: session.usage?.cost || 0,
      }),
    }).catch(() => {});
  } catch {
    // Silently fail
  }
}

function doSyncMessage(sessionId: string, message: OpenCodeMessage): void {
  try {
    const config = getConfig();
    if (!config?.apiKey || !config?.convexUrl) return;
    const url = config.convexUrl.replace(".convex.cloud", ".convex.site");
    fetch(`${url}/sync/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        sessionExternalId: sessionId,
        externalId: message.id,
        role: message.role,
        textContent: extractText(message.content),
        model: message.model,
        promptTokens: message.usage?.promptTokens,
        completionTokens: message.usage?.completionTokens,
        durationMs: message.duration,
      }),
    }).catch(() => {});
  } catch {
    // Silently fail
  }
}

// Plugin function - this is the ONLY export
const OpenCodeSyncPlugin = async (_ctx: Record<string, unknown>) => {
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
            doSyncSession(session);
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
            doSyncMessage(sessionId, message);
          }
        }
      } catch {
        // Silently fail
      }
    },
  };
};

export default OpenCodeSyncPlugin;
