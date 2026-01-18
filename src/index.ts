import type { Plugin } from "@opencode-ai/plugin";
import { getConfig } from "./config.js";
// Track what we've already synced to avoid duplicates
const syncedSessions = new Set<string>();
const syncedMessages = new Set<string>();
// Store message parts and metadata to combine them
const messagePartsText = new Map<string, string[]>();
const messageMetadata = new Map<string, { role: string; sessionId: string; info: any }>();
// Debounce map: messageId -> timeout
const syncTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 800;
/**
 * Infer role from content patterns when metadata doesn't provide it
 */
function inferRole(textContent: string): "user" | "assistant" {
  // Assistant messages typically:
  // - Start with "I'll", "Let me", "Here's", "I can", "I've", "I'm going to"
  // - Contain code blocks (```)
  // - Are longer and more structured
  // - Contain technical explanations
  const assistantPatterns = [
    /^(I'll|Let me|Here's|I can|I've|I'm going to|I will|Sure|Certainly|Of course)/i,
    /```[\s\S]+```/, // Code blocks
    /^(Yes|No),?\s+(I|you|we|this|that)/i, // Answering patterns
    /\*\*[^*]+\*\*/, // Bold markdown (explanations)
    /^\d+\.\s+\*\*/, // Numbered lists with bold
  ];
  // User messages typically:
  // - Are questions (end with ?)
  // - Are short commands/requests
  // - Start with action words like "create", "fix", "add", "update", "show"
  const userPatterns = [
    /\?$/, // Questions
    /^(create|fix|add|update|show|make|build|implement|write|delete|remove|change|modify|help|can you|please|I want|I need)/i,
    /^@/, // File references
  ];
  // Check assistant patterns first (they're more distinctive)
  for (const pattern of assistantPatterns) {
    if (pattern.test(textContent)) {
      return "assistant";
    }
  }
  // Check user patterns
  for (const pattern of userPatterns) {
    if (pattern.test(textContent)) {
      return "user";
    }
  }
  // Default heuristic: shorter messages are usually user, longer are assistant
  return textContent.length > 500 ? "assistant" : "user";
}
/**
 * Sync a session to the cloud
 */
function doSyncSession(session: any) {
  try {
    const config = getConfig();
    if (!config?.apiKey || !config?.convexUrl) {
      console.error("[opencode-sync] Missing config - cannot sync session");
      return;
    }
    const url = config.convexUrl.replace(".convex.cloud", ".convex.site");
    console.log("[opencode-sync] Syncing session:", session.id);
    // Handle both old and new session property names
    const projectPath = session.path?.cwd || session.cwd || session.directory;
    const modelId = session.modelID || session.model?.modelID || session.model;
    const providerId = session.providerID || session.model?.providerID || session.provider;
    const promptTokens = session.tokens?.input || session.usage?.promptTokens || 0;
    const completionTokens = session.tokens?.output || session.usage?.completionTokens || 0;
    const cost = session.cost || session.usage?.cost || 0;
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
        cost,
      }),
    })
      .then((r) => r.json())
      .then((data) => console.log("[opencode-sync] Session sync response:", data))
      .catch((err) => console.error("[opencode-sync] Session sync error:", err));
  } catch (err) {
    console.error("[opencode-sync] doSyncSession error:", err);
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
  metadata?: any
) {
  try {
    const config = getConfig();
    if (!config?.apiKey || !config?.convexUrl) {
      console.error("[opencode-sync] Missing config - cannot sync message");
      return;
    }
    // Don't sync empty messages
    if (!textContent || textContent.trim().length === 0) {
      console.log("[opencode-sync] Skipping empty message:", messageId);
      return;
    }
    // Infer role if unknown or not provided
    const finalRole = role === "unknown" || !role ? inferRole(textContent) : role;
    const url = config.convexUrl.replace(".convex.cloud", ".convex.site");
    console.log(
      "[opencode-sync] Syncing message:",
      messageId,
      "role:",
      finalRole,
      "text length:",
      textContent.length
    );
    // Calculate duration if we have timestamps
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
        textContent,
        model: metadata?.modelID,
        promptTokens: metadata?.tokens?.input,
        completionTokens: metadata?.tokens?.output,
        durationMs,
      }),
    })
      .then((r) => r.json())
      .then((data) => console.log("[opencode-sync] Message sync response:", data))
      .catch((err) => console.error("[opencode-sync] Message sync error:", err));
  } catch (err) {
    console.error("[opencode-sync] doSyncMessage error:", err);
  }
}
/**
 * Try to sync a message if we have both metadata and text content
 */
function trySyncMessage(messageId: string) {
  // Check if already synced
  if (syncedMessages.has(messageId)) return;
  // Get metadata and text parts
  const metadata = messageMetadata.get(messageId);
  const textParts = messagePartsText.get(messageId);
  // Need both metadata (for role) and text content
  if (!metadata || !textParts || textParts.length === 0) return;
  const textContent = textParts.join("");
  if (!textContent.trim()) return;
  // Mark as synced and send
  syncedMessages.add(messageId);
  doSyncMessage(metadata.sessionId, messageId, metadata.role, textContent, metadata.info);
  // Clean up stored data to free memory
  messagePartsText.delete(messageId);
  messageMetadata.delete(messageId);
}
/**
 * Schedule a debounced sync for a message
 * This waits for streaming to complete before syncing
 */
function scheduleSyncMessage(messageId: string) {
  // Clear existing timeout for this message
  const existing = syncTimeouts.get(messageId);
  if (existing) clearTimeout(existing);
  // Schedule new sync after debounce period
  const timeout = setTimeout(() => {
    syncTimeouts.delete(messageId);
    trySyncMessage(messageId);
  }, DEBOUNCE_MS);
  syncTimeouts.set(messageId, timeout);
}
export const OpenCodeSyncPlugin: Plugin = async (input) => {
  console.log("[opencode-sync] Plugin initialized for project:", input.project?.id);
  return {
    event: async ({ event }) => {
      try {
        const props = event.properties as any;
        // ========== SESSION EVENTS ==========
        if (
          event.type === "session.created" ||
          event.type === "session.updated" ||
          event.type === "session.idle"
        ) {
          const sessionId = props?.id;
          if (sessionId) {
            // Only sync session.created once
            if (event.type === "session.created") {
              if (syncedSessions.has(sessionId)) return;
              syncedSessions.add(sessionId);
            }
            doSyncSession(props);
          }
        }
        // ========== MESSAGE METADATA (no text here!) ==========
        if (event.type === "message.updated") {
          const info = props?.info;
          if (info?.id && info?.sessionID && info?.role) {
            console.log("[opencode-sync] Message metadata received:", info.id, "role:", info.role);
            // Store metadata for when we get the text parts
            messageMetadata.set(info.id, {
              role: info.role,
              sessionId: info.sessionID,
              info,
            });
            // Schedule sync if we already have text parts (debounced)
            if (messagePartsText.has(info.id)) {
              scheduleSyncMessage(info.id);
            }
          }
        }
        // ========== MESSAGE PARTS (text content is HERE!) ==========
        if (event.type === "message.part.updated") {
          const part = props?.part;
          // Only process text parts
          if (part?.type === "text" && part?.messageID && part?.sessionID) {
            const messageId = part.messageID;
            const text = part.text || "";
            console.log(
              "[opencode-sync] Text part received for message:",
              messageId,
              "length:",
              text.length
            );
            // Store the text (replace to get latest complete text)
            // OpenCode sends the full accumulated text on each update
            messagePartsText.set(messageId, [text]);
            // If we don't have metadata yet, create a placeholder
            // Role will be inferred from content if metadata never arrives
            if (!messageMetadata.has(messageId)) {
              messageMetadata.set(messageId, {
                role: "unknown", // Will be inferred or updated from message.updated
                sessionId: part.sessionID,
                info: {},
              });
            }
            // Schedule debounced sync (waits for streaming to settle)
            scheduleSyncMessage(messageId);
          }
        }
      } catch (err) {
        console.error("[opencode-sync] Event handler error:", err);
      }
    },
  };
};
export default OpenCodeSyncPlugin;