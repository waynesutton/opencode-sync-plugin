# Files

Brief description of each file in the opencode-sync-plugin codebase.

## Root

| File | Description |
|------|-------------|
| `package.json` | Package configuration, dependencies, scripts, and npm metadata |
| `tsconfig.json` | TypeScript compiler configuration |
| `README.md` | Project documentation, setup instructions, and usage guide |
| `.gitignore` | Git ignore patterns for node_modules, dist, etc. |
| `bun.lockb` | Bun package manager lockfile |

## src/

| File | Description |
|------|-------------|
| `index.ts` | OpenCode plugin that syncs sessions and messages to Convex backend via events |
| `cli.ts` | CLI tool for login, verify, sync, status, config, logout commands |
| `config.ts` | Config helpers to read/write credentials from `~/.opensync/credentials.json` |

## dist/ (generated)

| File | Description |
|------|-------------|
| `index.js` | Compiled plugin module (ESM) |
| `cli.js` | Compiled CLI binary |
| `config.js` | Compiled config module |
| `*.d.ts` | TypeScript declaration files |
