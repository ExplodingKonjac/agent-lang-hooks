---
sources:
  - "plugins/cpp-lang-hooks/scripts/common/turn_state.mjs"
  - "plugins/rust-lang-hooks/scripts/common/turn_state.mjs"
  - "plugins/python-lang-hooks/scripts/common/turn_state.mjs"
  - "tests/shared/sqlite.mjs"
---

# Data Model

## Entities

| Entity | Key fields | Notes |
|--------|------------|-------|
| C++ `turn_file_changes` | `turn_id TEXT PRIMARY KEY`, `cpp_changed INTEGER NOT NULL DEFAULT 0`, `updated_at TEXT NOT NULL` | Records whether a Codex turn changed C/C++ files. Stored in `${PLUGIN_DATA}/cpp-lang-hooks.sqlite3`. |
| Rust `turn_file_changes` | `turn_id TEXT PRIMARY KEY`, `rust_changed INTEGER NOT NULL DEFAULT 0`, `updated_at TEXT NOT NULL` | Records whether a Codex turn changed Rust files. Stored in `${PLUGIN_DATA}/rust-lang-hooks.sqlite3`. |
| Rust `turn_cargo_projects` | `turn_id TEXT NOT NULL`, `project_dir TEXT NOT NULL`, `updated_at TEXT NOT NULL`, primary key `(turn_id, project_dir)` | Records affected Cargo project roots for a Rust-changing turn. |
| Python `turn_file_changes` | `turn_id TEXT PRIMARY KEY`, `python_changed INTEGER NOT NULL DEFAULT 0`, `updated_at TEXT NOT NULL` | Records whether a Codex turn changed Python files or tracked Python config files. Stored in `${PLUGIN_DATA}/python-lang-hooks.sqlite3`. |
| Python `turn_python_projects` | `turn_id TEXT NOT NULL`, `project_root TEXT NOT NULL`, `updated_at TEXT NOT NULL`, primary key `(turn_id, project_root)` | Records affected Python project roots for a Python-changing turn. |
| JS/TS `turn_file_changes` | `turn_id TEXT PRIMARY KEY`, `js_changed INTEGER NOT NULL DEFAULT 0`, `updated_at TEXT NOT NULL` | Records whether a Codex turn changed JS/TS files or tracked JS/TS config files. Stored in `${PLUGIN_DATA}/js-lang-hooks.sqlite3`. |
| JS/TS `turn_js_projects` | `turn_id TEXT NOT NULL`, `project_root TEXT NOT NULL`, `updated_at TEXT NOT NULL`, primary key `(turn_id, project_root)` | Records affected JS/TS project roots for a JS/TS-changing turn. |
| JS/TS `turn_js_files` | `turn_id TEXT NOT NULL`, `file_path TEXT NOT NULL`, `updated_at TEXT NOT NULL`, primary key `(turn_id, file_path)` | Records touched existing JS/TS code files for lint-on-files Stop behavior. |

## Relationships

| From | To | Cardinality | Description |
|------|----|-------------|-------------|
| C++ `turn_file_changes.turn_id` | Codex hook `input.turn_id` | 1:1 | One C++ state row per observed turn. |
| Rust `turn_file_changes.turn_id` | Codex hook `input.turn_id` | 1:1 | One Rust state row per observed turn. |
| Rust `turn_cargo_projects.turn_id` | Rust `turn_file_changes.turn_id` | 1:N | A Rust-changing turn can map to multiple Cargo project directories. |
| Python `turn_file_changes.turn_id` | Codex hook `input.turn_id` | 1:1 | One Python state row per observed turn. |
| Python `turn_python_projects.turn_id` | Python `turn_file_changes.turn_id` | 1:N | A Python-changing turn can map to multiple Python project roots. |
| JS/TS `turn_file_changes.turn_id` | Codex hook `input.turn_id` | 1:1 | One JS/TS state row per observed turn. |
| JS/TS `turn_js_projects.turn_id` | JS/TS `turn_file_changes.turn_id` | 1:N | A JS/TS-changing turn can map to multiple JS/TS project roots. |
| JS/TS `turn_js_files.turn_id` | JS/TS `turn_file_changes.turn_id` | 1:N | A JS/TS-changing turn can map to multiple touched existing code files. |

## Schema Migrations

| Aspect | Detail |
|--------|--------|
| Tool | Inline `CREATE TABLE IF NOT EXISTS` through `node:sqlite` |
| Locations | `plugins/cpp-lang-hooks/scripts/common/turn_state.mjs`, `plugins/rust-lang-hooks/scripts/common/turn_state.mjs`, `plugins/python-lang-hooks/scripts/common/turn_state.mjs`, `plugins/js-lang-hooks/scripts/common/turn_state.mjs` |
| Strategy | Each helper lazily opens its own SQLite file under `PLUGIN_DATA`, creates required tables on demand, and closes the DB around each operation. |

## Caching

| Cache | Strategy | TTL | Invalidation |
|-------|----------|-----|--------------|
| C++ turn state | Persistent SQLite flag under `${PLUGIN_DATA}/cpp-lang-hooks.sqlite3` | No TTL currently | Future pruning can remove old turns; current code never clears rows. |
| Rust turn state | Persistent SQLite rows under `${PLUGIN_DATA}/rust-lang-hooks.sqlite3` | No TTL currently | Future pruning can remove old turns; current code never clears rows. |
| Python turn state | Persistent SQLite rows under `${PLUGIN_DATA}/python-lang-hooks.sqlite3` | No TTL currently | Future pruning can remove old turns; current code never clears rows. |
| JS/TS turn state | Persistent SQLite rows under `${PLUGIN_DATA}/js-lang-hooks.sqlite3` | No TTL currently | Future pruning can remove old turns; current code never clears rows; JS/TS state now includes affected project roots and touched existing code files. |
