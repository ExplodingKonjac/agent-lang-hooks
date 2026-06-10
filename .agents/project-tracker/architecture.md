---
sources:
  - "README.md"
  - ".agents/plugins/marketplace.json"
  - "scripts/*.py"
  - "plugins/*/.codex-plugin/plugin.json"
  - "plugins/**/*"
  - "templates/*/.codex-plugin/plugin.json"
  - "templates/**/*"
  - "tests/**/*"
---

# Architecture

## Overview

```text
+---------------------------+
| .agents/plugins           |
| marketplace manifest      |
+-------------+-------------+
              |
              v
+---------------------------+       +---------------------------+
| plugins/<language>        |       | templates/                |
| installable hook plugins  |<------| language-hook-template    |
+-------------+-------------+       +---------------------------+
              |
              v
+---------------------------+
| hook scripts              |
| PostToolUse / Stop        |
+-------------+-------------+
              |
              v
+---------------------------+
| host tools + PLUGIN_DATA  |
| clang, cmake, ctest, SQLite |
+---------------------------+
```

## Module Breakdown

| Module | Responsibility | Key files |
|--------|----------------|-----------|
| Marketplace | Declares locally available plugins and installation policy. | `.agents/plugins/marketplace.json` |
| Plugin generator | Copies the language template, rewrites plugin metadata, and appends marketplace entries. | `scripts/create_language_hook_plugin.py` |
| Language template | Minimal plugin skeleton for future language hook packages. | `templates/language-hook-template/` |
| C++ plugin manifest | Describes the C++ hook plugin and its hook registrations. | `plugins/cpp-lang-hooks/.codex-plugin/plugin.json`, `plugins/cpp-lang-hooks/hooks/hooks.json` |
| Hook common utilities | Parse hook input, collect edited file paths, find CMake project/build directories, parse env flags, and emit hook responses. | `plugins/cpp-lang-hooks/scripts/common/hook.mjs` |
| C++ post-edit hook | Deduplicates edited C/C++ paths, formats existing files, runs configurable `clang-tidy`, and marks turn state. | `plugins/cpp-lang-hooks/scripts/post_edit_hook.mjs` |
| C++ stop hook | Runs configurable `cmake --build` and `ctest` checks for CMake projects only when state says the current turn changed C/C++ files. | `plugins/cpp-lang-hooks/scripts/stop_hook.mjs` |
| C++ turn state | Stores per-turn C/C++ change flags in SQLite under `PLUGIN_DATA`. | `plugins/cpp-lang-hooks/scripts/common/turn_state.mjs` |

## Data Flow

1. A Codex edit tool triggers the C++ plugin `PostToolUse` hook.
2. `collectHookFilePaths()` extracts edited paths from `tool_input` or `apply_patch` content.
3. Paths are normalized and deduplicated; any mentioned C/C++ path records the turn as changed for `input.turn_id`.
4. Existing changed C/C++ files are formatted when enabled. `clang-tidy` runs on source files by default, with header tidy opt-in through `CPP_HOOKS_TIDY_HEADERS=1`.
5. A Codex `Stop` event invokes `stop_hook.mjs`.
6. The stop hook skips when disabled by env flags or when the current turn definitely has no C/C++ changes; otherwise it selects the first supported build directory, runs `cmake --build`, then runs `ctest`.

## Design Patterns

- Template Method style scaffolding: `create_language_hook_plugin.py` copies a fixed template and rewrites known metadata fields.
- Fail-open hook state: if `PLUGIN_DATA`, `turn_id`, or SQLite access is unavailable, the stop hook runs `ctest` rather than silently trusting missing state.
- Local host tool delegation: hooks call external C++ tools when installed and silently skip missing optional tools.
- Ordered CMake build discovery: hooks prefer `build/`, `cmake-build-debug/`, `cmake-build-release/`, then `out/build/` when those directories contain CMake marker files.
- Per-process hook caches: post-edit tidy checks cache nearest CMake project directories, build directory selection, and `compile_commands.json` presence during a single hook invocation.

## Security Boundaries

- Hook scripts execute local commands (`clang-format`, `clang-tidy`, `cmake`, `ctest`) against repository files, so they should keep arguments structured and avoid shell interpolation.
- Plugin state is stored only under `PLUGIN_DATA`; repository files are not used for runtime hook state.
- Environment flags only enable or disable local checks; they do not alter command arguments beyond selecting which checks run.
- The generator writes to `plugins/` and `.agents/plugins/marketplace.json`; it validates plugin names and JSON object shapes before writing.
