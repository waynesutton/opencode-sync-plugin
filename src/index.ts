import type { Plugin } from "@opencode-ai/plugin";
import { getConfig } from "./config.js";
import { existsSync, readFileSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Track what we've already synced to avoid duplicates
const syncedSessions = new Set<string>();

interface LocalSessionData {
  title?: string;
  slug?: string;
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
}

/**
 * Read session data from OpenCode's local storage (session + messages)
 */
function getLocalSessionData(sessionId: string): LocalSessionData | null {
  try {
    const basePath = join(homedir(), ".local", "share", "opencode", "storage");
    const sessionPath = join(basePath, "session");
    const messagePath = join(basePath, "message", sessionId);

    if (!existsSync(sessionPath)) return null;

    let result: LocalSessionData = {};

    // Read session file for title/slug
    const projectDirs = readdirSync(sessionPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const projectDir of projectDirs) {
      const sessionFile = join(sessionPath, projectDir, `${sessionId}.json`);
      if (existsSync(sessionFile)) {
        const content = readFileSync(sessionFile, "utf8");
        const data = JSON.parse(content);
        result.title = data.title;
        result.slug = data.slug;
        break;
      }
    }

    // Read message files for cost/tokens
    if (existsSync(messagePath)) {
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let totalCost = 0;

      const messageFiles = readdirSync(messagePath).filter((f) =>
        f.endsWith(".json"),
      );

      for (const msgFile of messageFiles) {
        try {
          const msgContent = readFileSync(join(messagePath, msgFile), "utf8");
          const msgData = JSON.parse(msgContent);

          if (msgData.tokens) {
            totalPromptTokens += msgData.tokens.input || 0;
            totalCompletionTokens += msgData.tokens.output || 0;
          }
          if (msgData.cost) {
            totalCost += msgData.cost;
          }
          // Get model/provider from first message that has it
          if (!result.model && msgData.modelID) {
            result.model = msgData.modelID;
          }
          if (!result.provider && msgData.providerID) {
            result.provider = msgData.providerID;
          }
        } catch {
          // Skip invalid message files
        }
      }

      result.promptTokens = totalPromptTokens;
      result.completionTokens = totalCompletionTokens;
      result.cost = totalCost;
    }

    return result;
  } catch {
    // Silent
  }
  return null;
}
const syncedMessages = new Set<string>();
// Store message parts and metadata to combine them
const messagePartsText = new Map<string, string[]>();
const messageMetadata = new Map<
  string,
  { role: string; sessionId: string; info: any }
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
    const modelId = session.modelID || session.model?.modelID || session.model;
    const providerId =
      session.providerID || session.model?.providerID || session.provider;
    const promptTokens =
      session.tokens?.input || session.usage?.promptTokens || 0;
    const completionTokens =
      session.tokens?.output || session.usage?.completionTokens || 0;
    const cost = session.cost || session.usage?.cost || 0;
    fetch(`${url}/sync/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        externalId: session.id,
        title: session.title || session.slug || "Untitled Session",
        projectPath,
        projectName: projectPath?.split("/").pop(),
        model: modelId,
        provider: providerId,
        promptTokens,
        completionTokens,
        cost,
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
) {
  try {
    const config = getConfig();
    if (!config?.apiKey || !config?.convexUrl) {
      return;
    }
    if (!textContent || textContent.trim().length === 0) {
      return;
    }
    const finalRole =
      role === "unknown" || !role ? inferRole(textContent) : role;
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
        textContent,
        model: metadata?.modelID,
        promptTokens: metadata?.tokens?.input,
        completionTokens: metadata?.tokens?.output,
        durationMs,
      }),
    }).catch(() => {});
  } catch {
    // Silent
  }
}

/**
 * Try to sync a message if we have both metadata and text content
 */
function trySyncMessage(messageId: string) {
  if (syncedMessages.has(messageId)) return;
  const metadata = messageMetadata.get(messageId);
  const textParts = messagePartsText.get(messageId);
  if (!metadata || !textParts || textParts.length === 0) return;
  const textContent = textParts.join("");
  if (!textContent.trim()) return;
  syncedMessages.add(messageId);
  doSyncMessage(
    metadata.sessionId,
    messageId,
    metadata.role,
    textContent,
    metadata.info,
  );
  messagePartsText.delete(messageId);
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

export const OpenCodeSyncPlugin: Plugin = async ({ client }) => {
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
            // On session.idle, delay then read from local storage
            // (gives OpenCode time to write title to disk)
            if (event.type === "session.idle") {
              setTimeout(() => {
                const localData = getLocalSessionData(sessionId);

                if (localData && (localData.title || localData.slug)) {
                  doSyncSession({
                    ...props,
                    title: localData.title || props?.title,
                    slug: localData.slug || props?.slug,
                    modelID: localData.model || props?.modelID,
                    providerID: localData.provider || props?.providerID,
                    tokens: {
                      input: localData.promptTokens || 0,
                      output: localData.completionTokens || 0,
                    },
                    cost: localData.cost || 0,
                  });
                } else {
                  // Fall back to event properties
                  doSyncSession(props);
                }
              }, 1000); // 1 second delay for file write
              return;
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
          }
        }
        // Message text parts
        if (event.type === "message.part.updated") {
          const part = props?.part;
          if (part?.type === "text" && part?.messageID && part?.sessionID) {
            const messageId = part.messageID;
            const text = part.text || "";
            messagePartsText.set(messageId, [text]);
            if (!messageMetadata.has(messageId)) {
              messageMetadata.set(messageId, {
                role: "unknown",
                sessionId: part.sessionID,
                info: {},
              });
            }
            scheduleSyncMessage(messageId);
          }
        }
      } catch {
        // Silent
      }
    },
  };
};

export default OpenCodeSyncPlugin;
