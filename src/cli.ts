#!/usr/bin/env node

import {
  getConfig,
  setConfig,
  clearConfig,
  getSyncedSessions,
  addSyncedSessions,
  clearSyncedSessions,
} from "./config.js";
import { readFileSync, existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { createInterface } from "readline";
import { fileURLToPath } from "url";

// Pricing per million tokens (USD) - includes cache pricing
const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  "claude-sonnet-4-20250514": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-opus-4-20250514": {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  "claude-opus-4-5-20251101": {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  "claude-3-5-sonnet-20241022": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-3-opus-20240229": {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  "claude-3-5-haiku-20241022": {
    input: 0.8,
    output: 4.0,
    cacheWrite: 1.0,
    cacheRead: 0.08,
  },
};

interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

function calculateCost(
  model: string | undefined,
  stats: TokenStats,
): number {
  if (!model) return 0;
  let pricing = MODEL_PRICING[model];
  if (!pricing) {
    const matchingKey = Object.keys(MODEL_PRICING).find(
      (k) => model.includes(k) || k.includes(model),
    );
    if (matchingKey) {
      pricing = MODEL_PRICING[matchingKey];
    }
  }
  if (!pricing) return 0;

  // Calculate cost with proper cache pricing
  const inputCost = stats.inputTokens * pricing.input;
  const cacheWriteCost = stats.cacheCreationTokens * pricing.cacheWrite;
  const cacheReadCost = stats.cacheReadTokens * pricing.cacheRead;
  const outputCost = stats.outputTokens * pricing.output;

  return (inputCost + cacheWriteCost + cacheReadCost + outputCost) / 1_000_000;
}

// Get package version
function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "login":
      await login();
      break;
    case "verify":
      verify();
      break;
    case "logout":
      logout();
      break;
    case "status":
      status();
      break;
    case "config":
      handleConfig();
      break;
    case "sync":
      await sync();
      break;
    case "version":
    case "-v":
    case "--version":
      console.log(`opencode-sync-plugin v${getVersion()}`);
      break;
    case "help":
    case "-h":
    case "--help":
      help();
      break;
    default:
      help();
  }
}

// Login with Convex URL and API Key
async function login() {
  console.log("\n  OpenSync Login\n");

  // Get Convex URL
  const convexUrl = await prompt(
    "Convex URL (e.g., https://your-project.convex.cloud): ",
  );
  if (!convexUrl) {
    console.error("Convex URL is required");
    process.exit(1);
  }

  // Validate URL format
  if (
    !convexUrl.includes(".convex.cloud") &&
    !convexUrl.includes(".convex.site")
  ) {
    console.error(
      "Invalid Convex URL. Should end with .convex.cloud or .convex.site",
    );
    process.exit(1);
  }

  // Get API Key
  const apiKey = await prompt(
    "Get your API key from your OpenSync.dev Settings page, starts with osk_. Enter it here: ",
  );
  if (!apiKey) {
    console.error("API Key is required");
    process.exit(1);
  }

  // Validate API Key format
  if (!apiKey.startsWith("osk_")) {
    console.error("Invalid API Key format. Should start with 'osk_'");
    process.exit(1);
  }

  // Test the API key by making a request to the health endpoint
  const siteUrl = convexUrl.replace(".convex.cloud", ".convex.site");

  console.log("\nVerifying credentials...");

  try {
    const response = await fetch(`${siteUrl}/health`);

    if (!response.ok) {
      console.error("\nFailed to connect to OpenSync backend.");
      console.error("Please verify your Convex URL is correct.");
      process.exit(1);
    }

    // Save config
    setConfig({ convexUrl, apiKey });

    console.log("\nLogin successful!\n");
    console.log("  Convex URL:", convexUrl);
    console.log("  API Key:", apiKey.slice(0, 8) + "..." + apiKey.slice(-4));
    console.log("\n  Next step: Add the plugin to OpenCode\n");
    console.log("  Run this command (copy/paste into terminal):\n");
    console.log(`  mkdir -p ~/.config/opencode && echo '{
    "$schema": "https://opencode.ai/config.json",
    "plugin": ["opencode-sync-plugin"]
  }' > ~/.config/opencode/opencode.json`);
    console.log("\n  Then verify your setup:\n");
    console.log("  opencode-sync verify\n");
    console.log(
      "  Note: If you have existing opencode.json settings, manually add",
    );
    console.log(
      '  "plugin": ["opencode-sync-plugin"] to preserve your config.\n',
    );
  } catch (e) {
    console.error("\nFailed to connect to OpenSync backend.");
    console.error("Please verify your Convex URL is correct.");
    process.exit(1);
  }
}

// Clear stored credentials
function logout() {
  clearConfig();
  console.log("\nLogged out successfully\n");
}

// Verify credentials and OpenCode config
function verify() {
  console.log("\n  OpenSync Setup Verification\n");

  let hasErrors = false;

  // Check credentials
  const config = getConfig();
  if (!config || !config.apiKey) {
    console.log("  Credentials: MISSING");
    console.log("  Run: opencode-sync login\n");
    hasErrors = true;
  } else {
    console.log("  Credentials: OK");
    console.log("  Convex URL:", config.convexUrl);
    console.log(
      "  API Key:",
      config.apiKey.slice(0, 8) + "..." + config.apiKey.slice(-4),
    );
    console.log();
  }

  // Check OpenCode config file (supports both .json and .jsonc)
  const configDir = join(homedir(), ".config", "opencode");
  const globalJsonConfig = join(configDir, "opencode.json");
  const globalJsoncConfig = join(configDir, "opencode.jsonc");
  const projectJsonConfig = join(process.cwd(), "opencode.json");
  const projectJsoncConfig = join(process.cwd(), "opencode.jsonc");

  let configFound = false;
  let configPath = "";
  let pluginRegistered = false;

  // Check global config first, then project config (both .json and .jsonc)
  for (const path of [
    globalJsonConfig,
    globalJsoncConfig,
    projectJsonConfig,
    projectJsoncConfig,
  ]) {
    if (existsSync(path)) {
      configFound = true;
      configPath = path;
      try {
        const content = readFileSync(path, "utf8");
        const parsed = JSON.parse(content);
        if (
          parsed.plugin &&
          Array.isArray(parsed.plugin) &&
          parsed.plugin.includes("opencode-sync-plugin")
        ) {
          pluginRegistered = true;
          break;
        }
      } catch {
        // JSON parse error, continue checking
      }
    }
  }

  if (!configFound) {
    console.log("  OpenCode Config: MISSING");
    console.log("  Run this command to create it:\n");
    console.log(`  mkdir -p ~/.config/opencode && echo '{
    "$schema": "https://opencode.ai/config.json",
    "plugin": ["opencode-sync-plugin"]
  }' > ~/.config/opencode/opencode.json\n`);
    hasErrors = true;
  } else if (!pluginRegistered) {
    console.log("  OpenCode Config: FOUND but plugin not registered");
    console.log("  Config file:", configPath);
    console.log('  Add "plugin": ["opencode-sync-plugin"] to your config\n');
    hasErrors = true;
  } else {
    console.log("  OpenCode Config: OK");
    console.log("  Config file:", configPath);
    console.log("  Plugin registered: opencode-sync-plugin");
    console.log();
  }

  // Final status
  if (hasErrors) {
    console.log(
      "  Setup incomplete. Fix the issues above and run verify again.\n",
    );
  } else {
    console.log(
      "  Ready! Start OpenCode and the plugin will load automatically.\n",
    );
  }
}

// Show authentication status
function status() {
  const config = getConfig();

  console.log("\n  OpenSync Status\n");

  if (!config) {
    console.log("  Status: Not configured\n");
    console.log("  Run: opencode-sync login\n");
    return;
  }

  if (!config.apiKey) {
    console.log("  Status: Not authenticated\n");
    console.log("  Convex URL:", config.convexUrl);
    console.log("\n  Run: opencode-sync login\n");
    return;
  }

  console.log("  Status: Configured\n");
  console.log("  Convex URL:", config.convexUrl);
  console.log(
    "  API Key:",
    config.apiKey.slice(0, 8) + "..." + config.apiKey.slice(-4),
  );
  console.log();
}

// Handle config command
function handleConfig() {
  showConfig();
}

// Show current configuration
function showConfig() {
  const config = getConfig();

  console.log("\n  OpenSync Config\n");

  if (!config) {
    console.log("  No configuration found.\n");
    console.log("  Run: opencode-sync login\n");
    return;
  }

  console.log("  Convex URL:", config.convexUrl);
  console.log(
    "  API Key:",
    config.apiKey
      ? config.apiKey.slice(0, 8) + "..." + config.apiKey.slice(-4)
      : "Not set",
  );
  console.log();
}

// OpenCode session type
interface OpenCodeLocalSession {
  id: string;
  slug?: string;
  version?: string;
  projectID?: string;
  directory?: string;
  title?: string;
  time?: { created?: number; updated?: number };
  summary?: { additions?: number; deletions?: number; files?: number };
}

// OpenCode message type
interface OpenCodeLocalMessage {
  id: string;
  sessionID: string;
  role: string;
  time?: { created?: number; completed?: number };
  modelID?: string;
  providerID?: string;
  cost?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache_creation?: number;
    cache_read?: number;
    cache?: { write?: number; read?: number };
  };
}

// Part type for tool-call and tool-result
interface MessagePart {
  type: "tool-call" | "tool-result";
  content: unknown;
}

// Read message content (text and tool parts) from the part directory
function getMessageContent(
  partBasePath: string,
  messageId: string,
): { textContent: string; parts: MessagePart[] } {
  const messagePartPath = join(partBasePath, messageId);
  if (!existsSync(messagePartPath)) {
    return { textContent: "", parts: [] };
  }

  try {
    const partFiles = readdirSync(messagePartPath).filter((f) =>
      f.endsWith(".json"),
    );
    let textContent = "";
    const parts: MessagePart[] = [];

    for (const partFile of partFiles) {
      try {
        const partData = JSON.parse(
          readFileSync(join(messagePartPath, partFile), "utf8"),
        );
        if (partData.type === "text" && partData.text) {
          textContent += partData.text;
        } else if (partData.type === "tool") {
          // OpenCode stores tool calls as type "tool" with tool name and state
          parts.push({
            type: "tool-call",
            content: {
              id: partData.id,
              name: partData.tool,
              args: partData.state?.input,
              status: partData.state?.status,
            },
          });
        }
      } catch {
        // Skip invalid part files
      }
    }

    return { textContent, parts };
  } catch {
    return { textContent: "", parts: [] };
  }
}

// Test sync connectivity and optionally sync local sessions
async function sync() {
  const syncAll = args.includes("--all");
  const syncNew = args.includes("--new");
  const syncForce = args.includes("--force");

  const config = getConfig();
  if (!config || !config.apiKey || !config.convexUrl) {
    console.log("\n  Status: Not configured\n");
    console.log("  Run: opencode-sync login\n");
    return;
  }

  const siteUrl = config.convexUrl.replace(".convex.cloud", ".convex.site");

  if (syncForce) {
    // Clear local tracking and sync all
    clearSyncedSessions();
    await syncAllSessions(siteUrl, config.apiKey, "force");
  } else if (syncAll) {
    // Query backend for existing, skip already synced
    await syncAllSessions(siteUrl, config.apiKey, "all");
  } else if (syncNew) {
    // Use local tracking file to skip already synced
    await syncAllSessions(siteUrl, config.apiKey, "new");
  } else {
    await syncConnectivityTest(siteUrl, config.apiKey);
  }
}

// Test connectivity with a test session
async function syncConnectivityTest(siteUrl: string, apiKey: string) {
  console.log("\n  OpenSync Connectivity Test\n");

  // Test health endpoint
  console.log("  Testing backend health...");
  try {
    const healthRes = await fetch(`${siteUrl}/health`);
    if (healthRes.ok) {
      const healthData = await healthRes.json();
      console.log("  Health: OK");
      console.log("  Response:", JSON.stringify(healthData));
    } else {
      console.log("  Health: FAILED");
      console.log("  Status:", healthRes.status);
      return;
    }
  } catch (e) {
    console.log("  Health: FAILED");
    console.log("  Error:", e instanceof Error ? e.message : String(e));
    return;
  }

  console.log();

  // Test sync endpoint with a test session
  console.log("  Testing sync endpoint...");
  const testSessionId = `test-${Date.now()}`;
  try {
    const syncRes = await fetch(`${siteUrl}/sync/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        externalId: testSessionId,
        title: "CLI Sync Test",
        projectPath: process.cwd(),
        projectName: process.cwd().split("/").pop(),
        model: "test",
        provider: "opencode-sync-cli",
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
      }),
    });

    if (syncRes.ok) {
      const syncData = await syncRes.json();
      console.log("  Sync: OK");
      console.log("  Response:", JSON.stringify(syncData));
      console.log();
      console.log("  Test session created. Check your OpenSync dashboard.\n");
    } else {
      console.log("  Sync: FAILED");
      console.log("  Status:", syncRes.status);
      const text = await syncRes.text();
      if (text) console.log("  Body:", text);
      console.log();
    }
  } catch (e) {
    console.log("  Sync: FAILED");
    console.log("  Error:", e instanceof Error ? e.message : String(e));
    console.log();
  }
}

// Fetch already-synced session IDs from the backend
async function fetchBackendSessionIds(
  siteUrl: string,
  apiKey: string,
): Promise<Set<string>> {
  try {
    const res = await fetch(`${siteUrl}/sync/sessions/list`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      return new Set(Array.isArray(data.sessionIds) ? data.sessionIds : []);
    }
  } catch {
    // Backend endpoint may not exist yet, return empty set
  }
  return new Set();
}

// Sync local OpenCode sessions to the backend
async function syncAllSessions(
  siteUrl: string,
  apiKey: string,
  mode: "all" | "new" | "force",
) {
  const modeLabel =
    mode === "force"
      ? "Force Syncing"
      : mode === "new"
        ? "Syncing New"
        : "Syncing All";
  console.log(`\n  OpenSync: ${modeLabel} Local Sessions\n`);

  const opencodePath = join(
    homedir(),
    ".local",
    "share",
    "opencode",
    "storage",
  );
  const sessionPath = join(opencodePath, "session");
  const messagePath = join(opencodePath, "message");
  const partPath = join(opencodePath, "part");

  if (!existsSync(sessionPath)) {
    console.log("  No OpenCode sessions found.");
    console.log("  Expected path:", sessionPath);
    console.log();
    return;
  }

  // Collect all session files from all project directories
  const sessions: Array<{ file: string; data: OpenCodeLocalSession }> = [];

  try {
    const projectDirs = readdirSync(sessionPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const projectDir of projectDirs) {
      const projectSessionPath = join(sessionPath, projectDir);
      const sessionFiles = readdirSync(projectSessionPath).filter((f) =>
        f.endsWith(".json"),
      );

      for (const file of sessionFiles) {
        try {
          const content = readFileSync(join(projectSessionPath, file), "utf8");
          const data = JSON.parse(content) as OpenCodeLocalSession;
          if (data.id) {
            sessions.push({ file, data });
          }
        } catch {
          // Skip invalid files
        }
      }
    }
  } catch (e) {
    console.log(
      "  Error reading sessions:",
      e instanceof Error ? e.message : String(e),
    );
    return;
  }

  console.log(`  Found ${sessions.length} local sessions`);

  if (sessions.length === 0) {
    return;
  }

  // Get already-synced session IDs based on mode
  let alreadySynced = new Set<string>();
  if (mode === "all") {
    // Query backend for existing sessions
    console.log("  Checking backend for existing sessions...");
    alreadySynced = await fetchBackendSessionIds(siteUrl, apiKey);
    if (alreadySynced.size > 0) {
      console.log(`  Found ${alreadySynced.size} already synced on backend`);
    }
  } else if (mode === "new") {
    // Use local tracking file
    alreadySynced = getSyncedSessions();
    if (alreadySynced.size > 0) {
      console.log(`  Found ${alreadySynced.size} in local tracking file`);
    }
  }
  // mode === "force" - alreadySynced stays empty, sync everything

  // Filter sessions to sync
  const sessionsToSync = sessions.filter((s) => !alreadySynced.has(s.data.id));
  const skippedCount = sessions.length - sessionsToSync.length;

  if (skippedCount > 0) {
    console.log(`  Skipping ${skippedCount} already synced sessions`);
  }
  console.log(`  Will sync ${sessionsToSync.length} sessions\n`);

  if (sessionsToSync.length === 0) {
    console.log("  All sessions already synced. Use --force to resync.\n");
    return;
  }

  let syncedSessionCount = 0;
  let syncedMessages = 0;
  let failedSessions = 0;
  const newlySyncedIds: string[] = [];

  for (const session of sessionsToSync) {
    const { data } = session;
    process.stdout.write(
      `  Syncing: ${data.title || data.slug || data.id}... `,
    );

    // Calculate total tokens and cost from messages
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCacheCreationTokens = 0;
    let totalCacheReadTokens = 0;
    let totalMessageCost = 0;
    let model = "";
    let provider = "";

    // Read messages for this session
    const sessionMessagePath = join(messagePath, data.id);
    const messages: OpenCodeLocalMessage[] = [];

    if (existsSync(sessionMessagePath)) {
      try {
        const messageFiles = readdirSync(sessionMessagePath).filter((f) =>
          f.endsWith(".json"),
        );

        for (const msgFile of messageFiles) {
          try {
            const msgContent = readFileSync(
              join(sessionMessagePath, msgFile),
              "utf8",
            );
            const msgData = JSON.parse(msgContent) as OpenCodeLocalMessage;
            if (msgData.id && msgData.sessionID === data.id) {
              messages.push(msgData);

              // Aggregate tokens and cost
              if (msgData.tokens) {
                totalPromptTokens += msgData.tokens.input || 0;
                totalCompletionTokens += msgData.tokens.output || 0;
                // OpenCode uses tokens.cache.write/read, not cache_creation/cache_read
                totalCacheCreationTokens += msgData.tokens.cache?.write || msgData.tokens.cache_creation || 0;
                totalCacheReadTokens += msgData.tokens.cache?.read || msgData.tokens.cache_read || 0;
              }
              // Track raw cost from messages as fallback
              if (msgData.cost) {
                totalMessageCost += msgData.cost;
              }
              if (msgData.modelID && !model) {
                model = msgData.modelID;
              }
              if (msgData.providerID && !provider) {
                provider = msgData.providerID;
              }
            }
          } catch {
            // Skip invalid message files
          }
        }
      } catch {
        // No messages directory
      }
    }

    // Calculate cost from tokens using model pricing, fall back to message costs
    let totalCost = calculateCost(model || undefined, {
      inputTokens: totalPromptTokens,
      outputTokens: totalCompletionTokens,
      cacheCreationTokens: totalCacheCreationTokens,
      cacheReadTokens: totalCacheReadTokens,
    });
    // Fall back to aggregated message costs for models not in pricing table
    if (totalCost === 0 && totalMessageCost > 0) {
      totalCost = totalMessageCost;
    }

    // Calculate duration from session timestamps
    let durationMs: number | undefined;
    if (data.time?.created && data.time?.updated) {
      durationMs = data.time.updated - data.time.created;
    }

    // Sync the session
    try {
      const sessionRes = await fetch(`${siteUrl}/sync/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          externalId: data.id,
          title: data.title || data.slug || "Untitled",
          projectPath: data.directory,
          projectName: data.directory?.split("/").pop(),
          model: model || "unknown",
          provider: provider || "opencode",
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          cacheCreationTokens: totalCacheCreationTokens,
          cacheReadTokens: totalCacheReadTokens,
          cost: totalCost,
          durationMs,
        }),
      });

      if (!sessionRes.ok) {
        console.log("FAILED");
        failedSessions++;
        continue;
      }

      syncedSessionCount++;
      newlySyncedIds.push(data.id);

      // Sync messages
      let msgCount = 0;
      for (const msg of messages) {
        try {
          // Get the actual message content (text and tool parts) from the part directory
          const { textContent, parts } = getMessageContent(partPath, msg.id);

          const msgRes = await fetch(`${siteUrl}/sync/message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              sessionExternalId: data.id,
              externalId: msg.id,
              role: msg.role,
              textContent,
              model: msg.modelID,
              promptTokens: msg.tokens?.input,
              completionTokens: msg.tokens?.output,
              durationMs:
                msg.time?.completed && msg.time?.created
                  ? msg.time.completed - msg.time.created
                  : undefined,
              parts: parts.length > 0 ? parts : undefined,
            }),
          });

          if (msgRes.ok) {
            msgCount++;
            syncedMessages++;
          }
        } catch {
          // Skip failed messages
        }
      }

      console.log(`OK (${msgCount} messages)`);
    } catch (e) {
      console.log("FAILED");
      failedSessions++;
    }
  }

  // Save newly synced session IDs to local tracking
  if (newlySyncedIds.length > 0) {
    addSyncedSessions(newlySyncedIds);
  }

  console.log();
  console.log(`  Summary:`);
  console.log(`    Sessions synced: ${syncedSessionCount}`);
  console.log(`    Messages synced: ${syncedMessages}`);
  if (skippedCount > 0) {
    console.log(`    Skipped: ${skippedCount}`);
  }
  if (failedSessions > 0) {
    console.log(`    Failed: ${failedSessions}`);
  }
  console.log();
  console.log("  Check your OpenSync dashboard to view synced sessions.\n");
}

// Show help
function help() {
  const version = getVersion();
  console.log(`
  OpenSync CLI v${version}

  Usage: opencode-sync <command> [options]

  Commands:
    login         Configure with Convex URL and API Key
    verify        Verify credentials and OpenCode config
    sync          Test connectivity and create a test session
    sync --new    Sync only sessions not in local tracking file
    sync --all    Sync all sessions (checks backend, skips existing)
    sync --force  Clear tracking and resync all sessions
    logout        Clear stored credentials
    status        Show current authentication status
    config        Show current configuration
    version       Show version number
    help          Show this help message

  Setup:
    1. Go to your OpenSync dashboard Settings page
    2. Generate an API Key (starts with osk_)
    3. Run: opencode-sync login
    4. Enter your Convex URL and API Key
    5. Add plugin to opencode.json (see instructions after login)
    6. Run: opencode-sync verify
    7. Run: opencode-sync sync (to test connectivity)
    8. Run: opencode-sync sync --new (to sync new sessions only)

  Sync Modes:
    --new    Fast: uses local tracking, skips previously synced
    --all    Accurate: queries backend, skips existing on server
    --force  Full: clears tracking and resyncs everything
`);
}

// Simple prompt helper using readline
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

main().catch(console.error);
