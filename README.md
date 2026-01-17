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

Add the plugin to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-sync-plugin"]
}
```

Or add globally at `~/.config/opencode/opencode.json`.

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
