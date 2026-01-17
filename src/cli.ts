#!/usr/bin/env node

import {
  getConfig,
  setConfig,
  clearConfig,
} from "./index.js";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "login":
      await login();
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
    console.log("\n  Add the plugin to your opencode.json:");
    console.log('  { "plugin": ["opencode-sync-plugin"] }\n');
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
    logout  Clear stored credentials
    status  Show current authentication status
    config  Show current configuration

  Setup:
    1. Go to your OpenSync dashboard Settings page
    2. Generate an API Key (starts with osk_)
    3. Run: opencode-sync login
    4. Enter your Convex URL and API Key
    5. Add plugin to opencode.json: { "plugin": ["opencode-sync-plugin"] }
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
