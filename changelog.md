# Changelog

All notable changes to opencode-sync-plugin.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.3.6] - 2026-01-22

### Fixed
- Added 1 second delay before reading local storage on session.idle
- Gives OpenCode time to write session title to disk before plugin reads it
- Resolves timing issue where title was read before file was updated

## [0.3.5] - 2026-01-22

### Fixed
- Session cost and token counts now sync correctly from message data
- Aggregates cost, promptTokens, and completionTokens from all messages in session
- Reads model and provider from message files for accurate tracking

## [0.3.4] - 2026-01-22

### Fixed
- Session titles now read directly from OpenCode's local storage for reliability
- Falls back to SDK client query if local storage unavailable
- Resolves "Untitled Session" issue when SDK client is not available in plugin context

## [0.3.3] - 2026-01-22

### Fixed
- Session titles now sync correctly instead of showing "Untitled"
- Plugin queries OpenCode SDK on session.idle for accurate title
- Added slug as fallback when title is not available

### Added
- Upgrade instructions in README
- Backfill command documentation (`sync --force` to update existing sessions)

## [0.3.1] - 2026-01-19

### Added
- JSONC support in verify command (detects both .json and .jsonc config files)

## [0.3.0] - 2026-01-18

### Removed
- All console logging from plugin (completely silent operation in OpenCode)
- `config --logging` CLI option (no longer needed)

### Changed
- Plugin now operates silently with no terminal output
- Simplified config.ts by removing logging-related functions

## [0.2.8] - 2026-01-18

### Added
- `sync --new` command to sync only sessions not in local tracking file
- `sync --force` command to clear tracking and resync all sessions
- Local session tracking file (`~/.opensync/synced-sessions.json`)
- Backend query for existing sessions with `sync --all`

### Changed
- `sync --all` now queries backend to skip already-synced sessions
- Added skip count to sync summary output

## [0.2.7] - 2026-01-18

### Added
- Debounced message syncing (800ms) to wait for streaming to complete
- Role inference from message content when metadata unavailable
- Memory cleanup after message sync to prevent leaks

### Changed
- Use official `@opencode-ai/plugin` types instead of inline definitions
- Improved role detection for user vs assistant messages

## [0.2.6] - 2026-01-17

### Added
- `sync` command to test backend connectivity and create test session
- `sync --all` command to bulk import all local OpenCode sessions
- Type-safe interfaces for local session and message formats
- Progress output showing each session being synced with message count
- Summary output with total sessions and messages synced

## [0.2.4] - 2026-01-17

### Changed
- Rewrite plugin with lazy loading and non-blocking sync
- Simplified plugin to single default export
- Added deduplication sets to prevent duplicate syncs

## [0.2.3] - 2026-01-17

### Added
- Safe logger wrapper to prevent logging failures from crashing the app

## [0.2.2] - 2026-01-17

### Changed
- Remove conf dependency, use native fs for Bun compatibility
- Config now stored at `~/.opensync/credentials.json`

## [0.2.1] - 2026-01-17

### Fixed
- Plugin blocking issue by lazy-loading config

### Added
- Troubleshooting docs for blank screen issues

## [0.2.0] - 2026-01-17

### Added
- Command-line setup instructions for opencode.json config
- Verify command to check credentials and plugin registration

## [0.1.1] - 2026-01-17

### Changed
- Updated npm publish links and docs

## [0.1.0] - 2026-01-17

### Added
- Initial release
- OpenCode plugin for syncing sessions and messages to Convex
- CLI with login, logout, status, config commands
- Event-driven sync on session.created, session.updated, session.idle
- Message sync on message.updated, message.part.updated
