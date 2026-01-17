import Conf from "conf";
import { homedir } from "os";
import { join } from "path";

interface Config {
  convexUrl: string;
  workosClientId: string;
}

interface Credentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

const config = new Conf<Config>({
  projectName: "opencode-sync",
  cwd: join(homedir(), ".config", "opencode-sync"),
  configName: "config",
});

const credentials = new Conf<Credentials>({
  projectName: "opencode-sync",
  cwd: join(homedir(), ".config", "opencode-sync"),
  configName: "credentials",
  encryptionKey: "opencode-sync-v1",
});

export function getConfig(): Config | null {
  const url = config.get("convexUrl");
  const clientId = config.get("workosClientId");
  if (!url || !clientId) return null;
  return { convexUrl: url, workosClientId: clientId };
}

export function setConfig(cfg: Config) {
  config.set("convexUrl", cfg.convexUrl);
  config.set("workosClientId", cfg.workosClientId);
}

export function getCredentials(): Credentials | null {
  const token = credentials.get("accessToken");
  if (!token) return null;
  return {
    accessToken: credentials.get("accessToken"),
    refreshToken: credentials.get("refreshToken"),
    expiresAt: credentials.get("expiresAt"),
    userId: credentials.get("userId"),
  };
}

export function setCredentials(creds: Credentials) {
  credentials.set("accessToken", creds.accessToken);
  credentials.set("refreshToken", creds.refreshToken);
  credentials.set("expiresAt", creds.expiresAt);
  credentials.set("userId", creds.userId);
}

export function clearCredentials() {
  credentials.clear();
}

// Check if token needs refresh
async function ensureValidToken(): Promise<string | null> {
  const creds = getCredentials();
  const cfg = getConfig();
  
  if (!creds || !cfg) return null;
  
  // Refresh if expires in less than 5 minutes
  if (Date.now() > creds.expiresAt - 300000) {
    try {
      const response = await fetch(
        "https://api.workos.com/user_management/authenticate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: cfg.workosClientId,
            refresh_token: creds.refreshToken,
            grant_type: "refresh_token",
          }),
        }
      );

      const data = await response.json();

      if (data.access_token) {
        setCredentials({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
          userId: data.user.id,
        });
        return data.access_token;
      }
    } catch (e) {
      console.error("Token refresh failed:", e);
      return null;
    }
  }
  
  return creds.accessToken;
}

// Sync a session
async function syncSession(session: any) {
  const token = await ensureValidToken();
  const cfg = getConfig();
  
  if (!token || !cfg) {
    console.error("[opencode-sync] Not authenticated. Run: opencode-sync login");
    return;
  }
  
  const siteUrl = cfg.convexUrl.replace(".cloud", ".site");
  
  try {
    const response = await fetch(`${siteUrl}/sync/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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
      console.error("[opencode-sync] Session sync failed:", await response.text());
    }
  } catch (e) {
    console.error("[opencode-sync] Session sync error:", e);
  }
}

// Sync a message
async function syncMessage(sessionId: string, message: any) {
  const token = await ensureValidToken();
  const cfg = getConfig();
  
  if (!token || !cfg) return;
  
  const siteUrl = cfg.convexUrl.replace(".cloud", ".site");
  
  // Extract parts from message content
  const parts = extractParts(message.content);
  
  try {
    const response = await fetch(`${siteUrl}/sync/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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
      console.error("[opencode-sync] Message sync failed:", await response.text());
    }
  } catch (e) {
    console.error("[opencode-sync] Message sync error:", e);
  }
}

// Extract title from first user message
function extractTitle(session: any): string {
  const firstMessage = session.messages?.find((m: any) => m.role === "user");
  if (firstMessage) {
    const text = extractTextContent(firstMessage.content);
    if (text) {
      return text.slice(0, 100) + (text.length > 100 ? "..." : "");
    }
  }
  return "Untitled Session";
}

// Extract text from message content
function extractTextContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n");
  }
  return "";
}

// Extract parts from message content
function extractParts(content: any): Array<{ type: string; content: any }> {
  if (typeof content === "string") {
    return [{ type: "text", content }];
  }
  
  if (Array.isArray(content)) {
    return content.map((part: any) => {
      if (part.type === "text") {
        return { type: "text", content: part.text };
      }
      if (part.type === "tool_use" || part.type === "tool-call") {
        return {
          type: "tool-call",
          content: { name: part.name, args: part.input || part.args },
        };
      }
      if (part.type === "tool_result" || part.type === "tool-result") {
        return {
          type: "tool-result",
          content: { result: part.content || part.result },
        };
      }
      return { type: part.type, content: part };
    });
  }
  
  return [];
}

// OpenCode Plugin Interface
export default {
  name: "opencode-sync",
  
  async onSessionStart(session: any) {
    await syncSession(session);
  },
  
  async onSessionEnd(session: any) {
    await syncSession(session);
  },
  
  async onMessage(session: any, message: any) {
    await syncMessage(session.id, message);
  },
  
  async onResponse(session: any, response: any) {
    await syncMessage(session.id, {
      ...response,
      role: "assistant",
    });
    // Update session with latest usage
    await syncSession(session);
  },
};
