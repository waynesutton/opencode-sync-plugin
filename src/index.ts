import type { Plugin } from "@opencode-ai/plugin";
import { getConfig } from "./config.js";

// Track what we've already synced to avoid duplicates
const syncedSessions = new Set<string>();
const syncedMessages = new Set<string>();
// Store message parts and metadata to combine them
const messagePartsText = new Map<string, string[]>();
const messageToolParts = new Map<
  string,
  Array<{ type: "tool-call" | "tool-result"; content: unknown }>
>();
const messageMetadata = new Map<
  string,
  { role: string; sessionId: string; info: any }
>();
// Track session stats from messages (model, tokens, cost)
const sessionStats = new Map<
  string,
  {
    model?: string;
    promptTokens: number;
    completionTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    cost: number;
  }
>();
// Debounce map: messageId -> timeout
const syncTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 800;

/**
 * Infer role from content patterns when metadata doesn't provide it
 */
function inferRole(textContent: string): "user" | "assistant" {
  const assistantPatterns = [
    /^(I'll|Let me|Here's|I can|I've|I'm going to|I will|Sure|Certainly|Of course)/i,
    /```[\s\S]+```/,
    /^(Yes|No),?\s+(I|you|we|this|that)/i,
    /\*\*[^*]+\*\*/,
    /^\d+\.\s+\*\*/,
  ];
  const userPatterns = [
    /\?$/,
    /^(create|fix|add|update|show|make|build|implement|write|delete|remove|change|modify|help|can you|please|I want|I need)/i,
    /^@/,
  ];
  for (const pattern of assistantPatterns) {
    if (pattern.test(textContent)) {
      return "assistant";
    }
  }
  for (const pattern of userPatterns) {
    if (pattern.test(textContent)) {
      return "user";
    }
  }
  return textContent.length > 500 ? "assistant" : "user";
}

/**
 * Sync a session to the cloud
 */
function doSyncSession(session: any) {
  try {
    const config = getConfig();
    if (!config?.apiKey || !config?.convexUrl) {
      return;
    }
    const url = config.convexUrl.replace(".convex.cloud", ".convex.site");
    const projectPath = session.path?.cwd || session.cwd || session.directory;

    // Get aggregated stats from messages if available
    const stats = sessionStats.get(session.id);

    // Use stats from messages, fall back to session data
    const modelId = stats?.model || session.modelID || session.model?.modelID || session.model;
    const providerId =
      session.providerID || session.model?.providerID || session.provider;
    const promptTokens = stats?.promptTokens ||
      session.tokens?.input || session.usage?.promptTokens || 0;
    const completionTokens = stats?.completionTokens ||
      session.tokens?.output || session.usage?.completionTokens || 0;
    const cacheCreationTokens = stats?.cacheCreationTokens ||
      session.tokens?.cache_creation || session.usage?.cacheCreationTokens || 0;
    const cacheReadTokens = stats?.cacheReadTokens ||
      session.tokens?.cache_read || session.usage?.cacheReadTokens || 0;
    const cost = stats?.cost || session.cost || session.usage?.cost || 0;

    // Calculate duration if timestamps available
    let durationMs: number | undefined;
    if (session.time?.created && session.time?.updated) {
      durationMs = session.time.updated - session.time.created;
    }

    fetch(`${url}/sync/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        externalId: session.id,
        title: session.title || "Untitled Session",
        projectPath,
        projectName: projectPath?.split("/").pop(),
        model: modelId,
        provider: providerId,
        promptTokens,
        completionTokens,
        cacheCreationTokens,
        cacheReadTokens,
        cost,
        durationMs,
      }),
    }).catch(() => {});
  } catch {
    // Silent
  }
}

/**
 * Sync a message to the cloud
 */
function doSyncMessage(
  sessionId: string,
  messageId: string,
  role: string,
  textContent: string,
  metadata?: any,
  parts?: Array<{ type: "tool-call" | "tool-result"; content: unknown }>,
) {
  try {
    const config = getConfig();
    if (!config?.apiKey || !config?.convexUrl) {
      return;
    }
    // Allow messages with parts even if no text content
    if ((!textContent || textContent.trim().length === 0) && (!parts || parts.length === 0)) {
      return;
    }
    const finalRole =
      role === "unknown" || !role ? inferRole(textContent || "") : role;
    const url = config.convexUrl.replace(".convex.cloud", ".convex.site");
    let durationMs: number | undefined;
    if (metadata?.time?.completed && metadata?.time?.created) {
      durationMs = metadata.time.completed - metadata.time.created;
    }
    fetch(`${url}/sync/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        sessionExternalId: sessionId,
        externalId: messageId,
        role: finalRole,
        textContent: textContent || "",
        model: metadata?.modelID,
        promptTokens: metadata?.tokens?.input,
        completionTokens: metadata?.tokens?.output,
        durationMs,
        parts,
      }),
    }).catch(() => {});
  } catch {
    // Silent
  }
}

/**
 * Try to sync a message if we have both metadata and text content (or tool parts)
 */
function trySyncMessage(messageId: string) {
  if (syncedMessages.has(messageId)) return;
  const metadata = messageMetadata.get(messageId);
  const textParts = messagePartsText.get(messageId);
  const toolParts = messageToolParts.get(messageId);
  if (!metadata) return;
  // Require either text parts or tool parts
  if ((!textParts || textParts.length === 0) && (!toolParts || toolParts.length === 0)) return;
  const textContent = textParts?.join("") || "";
  // Allow messages with tool parts even if text is empty
  if (!textContent.trim() && (!toolParts || toolParts.length === 0)) return;
  syncedMessages.add(messageId);
  doSyncMessage(
    metadata.sessionId,
    messageId,
    metadata.role,
    textContent,
    metadata.info,
    toolParts,
  );
  messagePartsText.delete(messageId);
  messageToolParts.delete(messageId);
  messageMetadata.delete(messageId);
}

/**
 * Schedule a debounced sync for a message
 */
function scheduleSyncMessage(messageId: string) {
  const existing = syncTimeouts.get(messageId);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(() => {
    syncTimeouts.delete(messageId);
    trySyncMessage(messageId);
  }, DEBOUNCE_MS);
  syncTimeouts.set(messageId, timeout);
}

export const OpenCodeSyncPlugin: Plugin = async () => {
  return {
    event: async ({ event }) => {
      try {
        const props = event.properties as any;
        // Session events
        if (
          event.type === "session.created" ||
          event.type === "session.updated" ||
          event.type === "session.idle"
        ) {
          const sessionId = props?.id;
          if (sessionId) {
            if (event.type === "session.created") {
              if (syncedSessions.has(sessionId)) return;
              syncedSessions.add(sessionId);
            }
            doSyncSession(props);
          }
        }
        // Message metadata
        if (event.type === "message.updated") {
          const info = props?.info;
          if (info?.id && info?.sessionID && info?.role) {
            messageMetadata.set(info.id, {
              role: info.role,
              sessionId: info.sessionID,
              info,
            });
            if (messagePartsText.has(info.id)) {
              scheduleSyncMessage(info.id);
            }
            // Track session stats from messages
            const sessionId = info.sessionID;
            const existing = sessionStats.get(sessionId) || {
              promptTokens: 0,
              completionTokens: 0,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
              cost: 0,
            };
            if (info.modelID && !existing.model) {
              existing.model = info.modelID;
            }
            if (info.tokens) {
              existing.promptTokens += info.tokens.input || 0;
              existing.completionTokens += info.tokens.output || 0;
              // OpenCode uses tokens.cache.write/read, not cache_creation/cache_read
              existing.cacheCreationTokens += info.tokens.cache?.write || info.tokens.cache_creation || 0;
              existing.cacheReadTokens += info.tokens.cache?.read || info.tokens.cache_read || 0;
            }
            if (info.cost) {
              existing.cost += info.cost;
            }
            sessionStats.set(sessionId, existing);
          }
        }
        // Message parts (text, tool-call, tool-result)
        if (event.type === "message.part.updated") {
          const part = props?.part;
          if (part?.messageID && part?.sessionID) {
            const messageId = part.messageID;
            // Ensure metadata exists
            if (!messageMetadata.has(messageId)) {
              messageMetadata.set(messageId, {
                role: "unknown",
                sessionId: part.sessionID,
                info: {},
              });
            }
            // Handle text parts
            if (part?.type === "text") {
              const text = part.text || "";
              messagePartsText.set(messageId, [text]);
              scheduleSyncMessage(messageId);
            }
            // Handle tool parts (OpenCode uses type "tool" for tool calls)
            else if (part?.type === "tool") {
              const existingParts = messageToolParts.get(messageId) || [];
              existingParts.push({
                type: "tool-call",
                content: {
                  id: part.id,
                  name: part.tool,
                  args: part.state?.input,
                  status: part.state?.status,
                },
              });
              messageToolParts.set(messageId, existingParts);
              scheduleSyncMessage(messageId);
            }
          }
        }
      } catch {
        // Silent
      }
    },
  };
};

export default OpenCodeSyncPlugin;
