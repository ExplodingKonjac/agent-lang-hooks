---
sources:
  - "README.md"
  - ".github/workflows/*.yml"
  - ".agents/plugins/marketplace.json"
  - ".claude-plugin/marketplace.json"
  - "scripts/*.py"
  - "plugins/**/*"
  - "templates/**/*"
  - "tests/**/*"
---

# Architecture

## Overview

```text
+---------------------------+      +---------------------------+
| .agents/plugins           |      | .claude-plugin           |
| Codex marketplace         |      | Claude marketplace       |
+-------------+-------------+      +-------------+-------------+
              \                           /
               \                         /
                v                       v
          +-----------------------------------+      +---------------------------+
          | plugins/<language>                |<-----| templates/                |
          | shared hook scripts + manifests   |      | language-hook-template    |
          +----------------+------------------+      +---------------------------+
                           |
                           v
          +-----------------------------------+
          | OpenCode adapters                 |
          | tool.execute.after / session.idle |
          +----------------+------------------+
                           |
                           v
          +-----------------------------------+
          | host tools + PLUGIN_DATA          |
          | clang, cmake, ctest, cargo, node  |
          | ecosystem tools, SQLite           |
          +-----------------------------------+
```

## Module Breakdown

| Module | Responsibility | Key files |
|--------|----------------|-----------|
| Codex marketplace | Declares locally available plugins and installation policy for Codex. | `.agents/plugins/marketplace.json` |
| Claude marketplace | Declares locally available plugins and metadata for Claude Code. | `.claude-plugin/marketplace.json` |
| CI workflow | Runs repository verification on GitHub-hosted runners. | `.github/workflows/ci.yml` |
| Plugin generator | Copies the language template, rewrites both manifest types, and updates both marketplace catalogs. | `scripts/create_language_hook_plugin.py` |
| Language template | Minimal plugin skeleton for future language hook packages across all supported tools. | `templates/language-hook-template/` |
| Per-plugin manifests | Describe each language hook plugin for Codex and Claude Code. | `plugins/*/.codex-plugin/plugin.json`, `plugins/*/.claude-plugin/plugin.json`, `plugins/*/hooks/hooks.json` |
| OpenCode adapter | Bridges OpenCode events into the existing stdin-based hook scripts. | `plugins/*/opencode/plugin.mjs`, `plugins/*/scripts/common/opencode_adapter.mjs` |
| Hook common utilities | Parse hook input, collect normalized edited file paths, find language project roots, parse env flags, and emit hook responses. | `plugins/*/scripts/common/hook.mjs` |
| Test harness | Shares temp fixture setup, hook spawning, and SQLite inspection helpers across split test modules. | `tests/shared/runtime.mjs`, `tests/shared/sqlite.mjs`, `tests/*/helpers.mjs`, `tests/cross_tool_marketplace.test.mjs` |

## Data Flow

For Codex and Claude Code:

1. An edit tool triggers `hooks/hooks.json`.
2. `post_edit_hook.mjs` receives stdin JSON, normalizes file paths, runs language-specific formatting/check-on-edit, and records turn state in SQLite.
3. `stop_hook.mjs` receives stdin JSON at Stop time, loads turn state from SQLite, and runs only the relevant final checks for the affected project roots.

For OpenCode:

1. `opencode/plugin.mjs` loads the shared `createOpenCodePlugin()` adapter for the plugin.
2. `tool.execute.after` listens for supported write tools (`edit`, `write`, `apply_patch`) and synthesizes the existing stdin payload shape expected by `post_edit_hook.mjs`.
3. The adapter assigns a synthetic `turn_id` per OpenCode session and reuses the existing SQLite turn-state flow.
4. `event` listens for `session.idle` and calls `stop_hook.mjs` once for the most recent unseen synthetic turn.
5. OpenCode failures are surfaced through plugin logging and warnings instead of Claude/Codex-style hard Stop blocking.

## Design Patterns

- Template Method scaffolding: `create_language_hook_plugin.py` copies a fixed template and rewrites known metadata fields for both marketplace formats.
- Compatibility adapter: OpenCode support is layered on top of the existing post-edit and stop hook scripts instead of re-implementing each language runtime twice.
- Fail-open hook state: if `PLUGIN_DATA`, `turn_id`, or SQLite access is unavailable, stop hooks fall back to checking the current project rather than trusting missing state.
- Per-language shared helpers: reusable behavior such as CMake build-dir selection, Python runtime discovery, JS/TS runtime discovery, and failure rendering lives under `scripts/common/`.

## Security Boundaries

- Hook scripts execute local commands against repository files, so arguments stay structured and avoid shell interpolation.
- Plugin state is stored only under `PLUGIN_DATA`; repository files are not used for runtime hook state.
- The generator writes to `plugins/`, `.agents/plugins/marketplace.json`, and `.claude-plugin/marketplace.json`; it validates plugin names and JSON object shapes before writing.
