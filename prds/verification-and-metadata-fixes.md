# Verification and metadata fixes

Created: 2026-10-04 02:01 UTC
Status: Tested; npm publication pending

## Scope
Fix OpenCode plugin issues #1 and #3 without including unpublished SDK, SQLite or unified CLI work.

- [x] Parse JSONC with comments and trailing commas using jsonc-parser.
- [x] Recognize bare, version-pinned and tagged opencode-sync-plugin entries.
- [x] Read nested model/provider fields with flat-field fallbacks in CLI and live sync.
- [x] Pass local session directory to live idle sync.
- [x] Five tests, built-plugin synthetic filesystem/fetch fixture, build, TypeScript and control-flow lint.
- [ ] Reconcile source main version 0.3.6 with published npm 0.3.7 before choosing the next version.
- [ ] Integrate these changes into the unpublished 0.4.0 branch without replacing its SQLite/SDK work.
- [ ] Publish a reviewed npm release and verify installation, then close #1/#3.

## Changed files
- `src/compatibility.ts`: JSONC registration and metadata helpers.
- `src/cli.ts`: verification and backfill metadata wiring.
- `src/index.ts`: directory and nested model/provider support.
- `tests/compatibility.test.ts`: registration and metadata cases.
- `tests/live-metadata.test.ts`: actual built plugin event with synthetic files and mocked network.
- `package.json`, `package-lock.json`: parser dependency and deterministic test command (Node 24 used).

No real credentials or sessions are used in tests. No npm package is published by this branch. Custom HTTP URL validation, SQLite storage, first-message stream handling, timestamps and subagents remain separate coordinated work.
