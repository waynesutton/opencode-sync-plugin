#!/usr/bin/env node

import {
  getConfig,
  setConfig,
  getCredentials,
  setCredentials,
  clearCredentials,
} from "./index.js";
import open from "open";
import { createServer } from "http";
import { URL } from "url";

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

async function login() {
  console.log("\n  OpenSync Login\n");

  // Get Convex URL
  const convexUrl = await prompt("Convex URL (e.g., https://your-project.convex.cloud): ");
  if (!convexUrl) {
    console.error("Convex URL is required");
    process.exit(1);
  }

  // Get WorkOS Client ID
  const workosClientId = await prompt("WorkOS Client ID (e.g., client_xxxxx): ");
  if (!workosClientId) {
    console.error("WorkOS Client ID is required");
    process.exit(1);
  }

  setConfig({ convexUrl, workosClientId });

  // Start local server for OAuth callback
  const port = 9876;
  const redirectUri = `http://localhost:${port}/callback`;

  console.log("\nOpening browser for authentication...\n");

  // Build auth URL
  const authUrl = new URL("https://api.workos.com/user_management/authorize");
  authUrl.searchParams.set("client_id", workosClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("provider", "authkit");

  // Create server to receive callback
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${port}`);

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");

      if (code) {
        try {
          // Exchange code for token
          const response = await fetch(
            "https://api.workos.com/user_management/authenticate",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_id: workosClientId,
                code,
                grant_type: "authorization_code",
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

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <html>
                <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff;">
                  <div style="text-align: center;">
                    <h1 style="color: #22c55e;">✓ Authentication Successful</h1>
                    <p>You can close this window and return to the terminal.</p>
                  </div>
                </body>
              </html>
            `);

            console.log("✓ Logged in successfully!\n");
            console.log(`  Email: ${data.user.email}`);
            console.log(`  User ID: ${data.user.id}\n`);

            server.close();
            process.exit(0);
          } else {
            throw new Error(data.error || "Authentication failed");
          }
        } catch (e: any) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff;">
                <div style="text-align: center;">
                  <h1 style="color: #ef4444;">✗ Authentication Failed</h1>
                  <p>${e.message}</p>
                </div>
              </body>
            </html>
          `);

          console.error("✗ Authentication failed:", e.message);
          server.close();
          process.exit(1);
        }
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing authorization code");
      }
    }
  });

  server.listen(port, () => {
    open(authUrl.toString());
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    console.error("\n✗ Login timed out. Please try again.");
    server.close();
    process.exit(1);
  }, 300000);
}

function logout() {
  clearCredentials();
  console.log("\n✓ Logged out successfully\n");
}

function status() {
  const config = getConfig();
  const creds = getCredentials();

  console.log("\n  OpenSync Status\n");

  if (!config) {
    console.log("  Status: Not configured\n");
    console.log("  Run: opencode-sync login\n");
    return;
  }

  if (!creds) {
    console.log("  Status: Not authenticated\n");
    console.log("  Convex URL:", config.convexUrl);
    console.log("\n  Run: opencode-sync login\n");
    return;
  }

  const isExpired = Date.now() > creds.expiresAt;

  console.log(`  Status: ${isExpired ? "Token expired" : "Logged in"}\n`);
  console.log("  User ID:", creds.userId);
  console.log("  Convex URL:", config.convexUrl);
  console.log("  Token expires:", new Date(creds.expiresAt).toLocaleString());
  console.log();
}

function showConfig() {
  const config = getConfig();
  
  console.log("\n  OpenSync Config\n");
  
  if (!config) {
    console.log("  No configuration found.\n");
    console.log("  Run: opencode-sync login\n");
    return;
  }
  
  console.log("  Convex URL:", config.convexUrl);
  console.log("  WorkOS Client ID:", config.workosClientId);
  console.log();
}

function help() {
  console.log(`
  OpenSync CLI

  Usage: opencode-sync <command>

  Commands:
    login   Authenticate with OpenSync
    logout  Clear stored credentials
    status  Show current authentication status
    config  Show current configuration

  Setup:
    1. Run: opencode-sync login
    2. Enter your Convex URL and WorkOS Client ID
    3. Complete authentication in browser
    4. Add plugin to opencode.json: { "plugin": ["opencode-sync-plugin"] }
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
