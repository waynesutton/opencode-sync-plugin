# opencode-sync-plugin

Sync your OpenCode sessions to the cloud. Search, share, and access your coding history from anywhere.

[![npm version](https://img.shields.io/npm/v/opencode-sync-plugin.svg)](https://www.npmjs.com/package/opencode-sync-plugin)

## Installation

### From npm

Published on npm: [opencode-sync-plugin](https://www.npmjs.com/package/opencode-sync-plugin)

```bash
npm install -g opencode-sync-plugin
```

### From source

```bash
git clone https://github.com/waynesutton/opencode-sync-plugin
cd opencode-sync-plugin
npm install
npm run build
```

## Setup

### 1. Get your credentials

You need two things from your OpenSync deployment:

- **Convex URL**: Your deployment URL from the Convex dashboard (e.g., `https://your-project-123.convex.cloud`)
- **API Key**: Generated in the OpenSync dashboard at **Settings > API Key** (starts with `osk_`)

The plugin automatically converts the `.cloud` URL to `.site` for API calls.

### 2. Configure the plugin

```bash
opencode-sync login
```

Follow the prompts:

1. Enter your Convex URL
2. Enter your API Key

No browser authentication required.

### 3. Add to OpenCode

**Quick setup (global config, works for all projects):**

```bash
mkdir -p ~/.config/opencode && echo '{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-sync-plugin"]
}' > ~/.config/opencode/opencode.json
```

**Or manually add** to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-sync-plugin"]
}
```

**Config locations:**

- Global: `~/.config/opencode/opencode.json` (applies to all projects)
- Per-project: `./opencode.json` in your project root

> **Note:** If you already have an `opencode.json` with other settings, edit the file manually and add `"plugin": ["opencode-sync-plugin"]` to preserve your existing configuration. OpenCode merges configs, so you can keep your theme, model, and other settings.

### 4. Verify installation

```bash
opencode-sync verify
```

This checks that both your credentials and OpenCode config are set up correctly. You should see:

```
  OpenSync Setup Verification

  Credentials: OK
  Convex URL: https://your-project.convex.cloud
  API Key: osk_****...****

  OpenCode Config: OK
  Config file: ~/.config/opencode/opencode.json
  Plugin registered: opencode-sync-plugin

  Ready! Start OpenCode and the plugin will load automatically.
```

## How it works

The plugin hooks into OpenCode events and syncs data automatically:

| Event | Action |
|-------|--------|
| `session.created` | Creates session record in cloud |
| `session.updated` | Updates session metadata |
| `session.idle` | Final sync with token counts and cost |
| `message.updated` | Syncs user and assistant messages |
| `message.part.updated` | Syncs completed message parts |

Data is stored in your Convex deployment. You can view, search, and share sessions via the web UI.

## CLI Commands

| Command | Description |
|---------|-------------|
| `opencode-sync login` | Configure with Convex URL and API Key |
| `opencode-sync verify` | Verify credentials and OpenCode config |
| `opencode-sync logout` | Clear stored credentials |
| `opencode-sync status` | Show authentication status |
| `opencode-sync config` | Show current configuration |

## Configuration storage

Credentials are stored at:

```
~/.config/opencode-sync/
  config.json       # Convex URL, API Key
```

## Plugin architecture

This plugin follows the [OpenCode plugin specification](https://opencode.ai/docs/plugins/):

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const OpenCodeSyncPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  // Initialize plugin
  await client.app.log({
    service: "opencode-sync",
    level: "info",
    message: "Plugin initialized",
  });

  return {
    // Subscribe to events
    event: async ({ event }) => {
      if (event.type === "session.created") {
        // Sync session to cloud
      }
      if (event.type === "message.updated") {
        // Sync message to cloud
      }
    },
  };
};
```

## Troubleshooting

### OpenCode won't start or shows blank screen

If OpenCode hangs or shows a blank screen after adding the plugin, remove the plugin config:

**Step 1: Open a new terminal window**

**Step 2: Remove the plugin from your config**

```bash
# Option A: Delete the entire config (if you only have the plugin configured)
rm ~/.config/opencode/opencode.json

# Option B: Edit the file to remove the plugin line
nano ~/.config/opencode/opencode.json
# Remove the "plugin": ["opencode-sync-plugin"] line and save
```

**Step 3: Clear the plugin cache**

```bash
rm -rf ~/.cache/opencode/node_modules/opencode-sync-plugin
```

**Step 4: Restart OpenCode**

```bash
opencode
```

### "Not authenticated" errors

```bash
opencode-sync login
```

### Invalid API Key

1. Go to your OpenSync dashboard
2. Navigate to Settings
3. Generate a new API Key
4. Run `opencode-sync login` with the new key

### Check status

```bash
opencode-sync status
```

### View logs

Plugin logs are available in OpenCode's log output. Look for entries with `service: "opencode-sync"`.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT
