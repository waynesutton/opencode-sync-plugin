# opencode-sync-plugin

Sync your OpenCode sessions to the cloud. Search, share, and access your coding history from anywhere.

## Installation

```bash
npm install -g opencode-sync-plugin
```

## Setup

### 1. Get Your Credentials

You need two things from your OpenSync deployment:

- **Convex URL** - Found in your Convex dashboard (e.g., `https://your-project-123.convex.cloud`)
- **WorkOS Client ID** - Found in your WorkOS dashboard (e.g., `client_xxxxx`)

### 2. Authenticate

```bash
opencode-sync login
```

Follow the prompts:

1. Enter your Convex URL
2. Enter your WorkOS Client ID
3. Complete authentication in browser

### 3. Add to OpenCode

Create or edit `opencode.json` in your project:

```json
{
  "plugin": ["opencode-sync-plugin"]
}
```

Or add globally at `~/.config/opencode/config.json`.

## Commands

| Command | Description |
|---------|-------------|
| `opencode-sync login` | Authenticate with OpenSync |
| `opencode-sync logout` | Clear stored credentials |
| `opencode-sync status` | Show authentication status |
| `opencode-sync config` | Show current configuration |

## How It Works

The plugin automatically syncs your sessions as you work:

- **Session start** - Creates session record
- **Each message** - Syncs user messages and assistant responses
- **Session end** - Updates final token counts and cost

Data is stored in your Convex deployment. You can view, search, and share sessions via the web UI.

## Configuration Storage

Credentials are stored at:

```
~/.config/opencode-sync/
├── config.json       # Convex URL, WorkOS Client ID
└── credentials.json  # Access tokens (encrypted)
```

## Troubleshooting

### "Not authenticated" errors

```bash
opencode-sync login
```

### Token expired

Tokens auto-refresh. If issues persist:

```bash
opencode-sync logout
opencode-sync login
```

### Check status

```bash
opencode-sync status
```

## License

MIT
# opencode-sync-plugin
