---
sources:
  - "scripts/*.py"
  - "plugins/**/*.mjs"
  - "plugins/**/*.json"
  - "templates/**/*.mjs"
  - "templates/**/*.json"
  - "tests/**/*.mjs"
---

# Implementation Details

## Entry Points

| Target | File | Purpose |
|--------|------|---------|
| Plugin generator CLI | `scripts/create_language_hook_plugin.py` | Creates or refreshes a plugin from `templates/language-hook-template/`, updates both marketplace catalogs, and rewrites both manifest types. |
| OpenCode installer CLI | `scripts/install_opencode_plugin.py` | Writes generated proxy modules into global or project OpenCode plugin directories. |
| OpenCode adapter template | `templates/language-hook-template/opencode/plugin.mjs` | Bridges OpenCode events into the existing post-edit and stop hook scripts. |
| OpenCode adapter helper | `plugins/*/scripts/common/opencode_adapter.mjs` | Synthesizes stdin payloads, manages synthetic turn ids, and surfaces OpenCode warnings through plugin logging. |
| Per-language post-edit hooks | `plugins/*/scripts/post_edit_hook.mjs` | Processes edited files after edit tools. |
| Per-language stop hooks | `plugins/*/scripts/stop_hook.mjs` | Runs or skips final checks at turn stop. |
| Shared test harness | `tests/shared/runtime.mjs`, `tests/shared/sqlite.mjs` | Spawns hook scripts, writes fake tools, and inspects SQLite state in tests. |

## Key Algorithms & Logic

- `normalize_name()` lowercases plugin names, replaces non-alphanumeric runs with `-`, trims separators, and enforces a 64-character limit.
- `create_language_hook_plugin.py` treats Codex, Claude Code, and OpenCode as one scaffold target set and refreshes existing plugin directories idempotently instead of failing on a pre-existing destination.
- `install_opencode_plugin.py` discovers `plugins/*/opencode/plugin.mjs`, selects all or comma-listed plugins, resolves global/project OpenCode plugin directories, and writes proxy modules that re-export absolute `file://` targets.
- The OpenCode installer treats files with its generated header as safe to refresh and refuses to replace unrelated files unless `--force` is supplied.
- `collectHookFilePaths(input, cwd)` supports ordinary edit tool inputs and parses `apply_patch` headers, including file moves.
- `createOpenCodePlugin()` maps OpenCode `tool.execute.after` write-style tools to synthesized `tool_name` / `tool_input` payloads understood by the existing hook scripts, then tracks a synthetic `turn_id` per session.
- The same OpenCode adapter reuses one pending synthetic turn id for all writes until `session.idle`, then invokes the existing stop hook once and consumes that turn; duplicate idle events are ignored.
- Each language stop hook continues to use the existing SQLite-backed turn-state logic, so OpenCode reuses the same file-change detection and project-root scoping as Codex/Claude.
- Stop checks are adoption-aware: empty suites and unadopted runners are skipped, while explicit non-placeholder package scripts remain authoritative.

## Error Handling Strategy

- Hook scripts emit blocking JSON when a required command fails.
- OpenCode post-edit adapter failures throw errors immediately for invalid hook execution or blocking post-edit responses.
- OpenCode idle-time stop failures are surfaced through plugin logging and warnings rather than strict Stop blocking.
- The Python generator raises explicit errors for invalid plugin names, invalid JSON shapes, or missing templates; re-running against an existing plugin directory is a supported refresh path.
- The OpenCode installer raises readable `SystemExit` messages for unknown plugin names, missing project directories, and protected overwrite attempts.

## Testing Strategy

| Test level | Location | What it covers |
|------------|----------|----------------|
| Cross-language aggregation | `tests/all.test.mjs` | Loads each language suite, asserts every plugin `scripts/common/hook.mjs` still matches the template copy exactly, and asserts the OpenCode adapter helper/module copies also match the template. |
| Cross-tool packaging, installer, and adapter coverage | `tests/cross_tool_marketplace.test.mjs` | Verifies generator idempotency across Codex/Claude/OpenCode artifacts, OpenCode installer proxy generation, and adapter idle/post-edit behavior. |
| Per-language hook integration | `tests/*-lang-hooks/*.test.mjs` | Existing post-edit, stop-hook, runtime helper, retry-mode, state retention, and failure-output coverage for each language plugin. |
| Generator smoke | `.github/workflows/ci.yml` | The temp-repo smoke path asserts Codex manifest, Claude manifest, OpenCode adapter module, and both marketplace entries. |

## Performance Considerations

- The stateful stop hooks avoid running expensive final checks on turns without relevant language edits.
- OpenCode adapters reuse the same SQLite-backed change tracking instead of re-scanning the project independently.
- Adapter-generated `PLUGIN_DATA` directories default to a temp-root location derived from the working directory hash, avoiding repo-local state writes when the caller does not provide `PLUGIN_DATA`.
