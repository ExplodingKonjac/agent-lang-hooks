---
sources:
  - "plugins/cpp-lang-hooks/scripts/common/turn_state.mjs"
  - "tests/cpp-lang-hooks/stateful_hooks.test.mjs"
---

# Data Model

## Entities

| Entity | Key fields | Notes |
|--------|------------|-------|
| `turn_file_changes` | `turn_id TEXT PRIMARY KEY`, `cpp_changed INTEGER NOT NULL DEFAULT 0`, `updated_at TEXT NOT NULL` | Records whether a Codex turn changed C/C++ files. |

## Relationships

| From | To | Cardinality | Description |
|------|----|-------------|-------------|
| `turn_file_changes.turn_id` | Codex hook `input.turn_id` | 1:1 | One state row per observed turn. |

## Schema Migrations

| Aspect | Detail |
|--------|--------|
| Tool | Inline `CREATE TABLE IF NOT EXISTS` through `node:sqlite` |
| Location | `plugins/cpp-lang-hooks/scripts/common/turn_state.mjs` |
| Strategy | Lazy initialization when a state helper opens the DB |

## Caching

| Cache | Strategy | TTL | Invalidation |
|-------|----------|-----|--------------|
| C++ turn state | Persistent SQLite flag under `${PLUGIN_DATA}/cpp-lang-hooks.sqlite3` | No TTL currently | Future pruning can remove old turns; current code never clears rows. |
