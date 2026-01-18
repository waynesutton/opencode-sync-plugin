#!/usr/bin/env node

import {
  getConfig,
  setConfig,
  clearConfig,
} from "./index.js";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

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
      showConfig();
      break;
    default:
      help();
  }
}

// Login with Convex URL and API Key
async function login() {
  console.log("\n  OpenSync Login\n");

  // Get Convex URL
  const convexUrl = await prompt("Convex URL (e.g., https://your-project.convex.cloud): ");
  if (!convexUrl) {
    console.error("Convex URL is required");
    process.exit(1);
  }

  // Validate URL format
  if (!convexUrl.includes(".convex.cloud") && !convexUrl.includes(".convex.site")) {
    console.error("Invalid Convex URL. Should end with .convex.cloud or .convex.site");
    process.exit(1);
  }

  // Get API Key
  const apiKey = await prompt("API Key (from Settings page, starts with osk_): ");
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
    console.log("  Note: If you have existing opencode.json settings, manually add");
    console.log('  "plugin": ["opencode-sync-plugin"] to preserve your config.\n');
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
    console.log("  API Key:", config.apiKey.slice(0, 8) + "..." + config.apiKey.slice(-4));
    console.log();
  }
  
  // Check OpenCode config file
  const opencodeConfigPath = join(homedir(), ".config", "opencode", "opencode.json");
  const projectConfigPath = join(process.cwd(), "opencode.json");
  
  let configFound = false;
  let configPath = "";
  let pluginRegistered = false;
  
  // Check global config first, then project config
  for (const path of [opencodeConfigPath, projectConfigPath]) {
    if (existsSync(path)) {
      configFound = true;
      configPath = path;
      try {
        const content = readFileSync(path, "utf8");
        const parsed = JSON.parse(content);
        if (parsed.plugin && Array.isArray(parsed.plugin) && parsed.plugin.includes("opencode-sync-plugin")) {
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
    console.log("  Setup incomplete. Fix the issues above and run verify again.\n");
  } else {
    console.log("  Ready! Start OpenCode and the plugin will load automatically.\n");
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
  console.log("  API Key:", config.apiKey.slice(0, 8) + "..." + config.apiKey.slice(-4));
  console.log();
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
  console.log("  API Key:", config.apiKey ? config.apiKey.slice(0, 8) + "..." + config.apiKey.slice(-4) : "Not set");
  console.log();
}

// Show help
function help() {
  console.log(`
  OpenSync CLI

  Usage: opencode-sync <command>

  Commands:
    login   Configure with Convex URL and API Key
    verify  Verify credentials and OpenCode config
    logout  Clear stored credentials
    status  Show current authentication status
    config  Show current configuration

  Setup:
    1. Go to your OpenSync dashboard Settings page
    2. Generate an API Key (starts with osk_)
    3. Run: opencode-sync login
    4. Enter your Convex URL and API Key
    5. Add plugin to opencode.json (see instructions after login)
    6. Run: opencode-sync verify
`);
}

// Simple prompt helper
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (data) => {
      input = data.toString().trim();
      resolve(input);
    });
  });
}

main().catch(console.error);
