---
sources:
  - "README.md"
  - ".github/workflows/*.yml"
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
| clang, cmake, ctest, cargo, node ecosystem tools, SQLite |
+---------------------------+
```

## Module Breakdown

| Module | Responsibility | Key files |
|--------|----------------|-----------|
| Marketplace | Declares locally available plugins and installation policy. | `.agents/plugins/marketplace.json` |
| CI workflow | Runs repository verification on GitHub-hosted runners. | `.github/workflows/ci.yml` |
| Plugin generator | Copies the language template, rewrites plugin metadata, and appends marketplace entries. | `scripts/create_language_hook_plugin.py` |
| Language template | Minimal plugin skeleton for future language hook packages. | `templates/language-hook-template/` |
| C++ plugin manifest | Describes the C++ hook plugin and its hook registrations. | `plugins/cpp-lang-hooks/.codex-plugin/plugin.json`, `plugins/cpp-lang-hooks/hooks/hooks.json` |
| Rust plugin manifest | Describes the Rust hook plugin and its hook registrations. | `plugins/rust-lang-hooks/.codex-plugin/plugin.json`, `plugins/rust-lang-hooks/hooks/hooks.json` |
| Python plugin manifest | Describes the Python hook plugin and its hook registrations. | `plugins/python-lang-hooks/.codex-plugin/plugin.json`, `plugins/python-lang-hooks/hooks/hooks.json` |
| JavaScript/TypeScript plugin manifest | Describes the JS/TS hook plugin and its hook registrations. | `plugins/js-lang-hooks/.codex-plugin/plugin.json`, `plugins/js-lang-hooks/hooks/hooks.json` |
| Hook common utilities | Parse hook input, collect normalized edited file paths, find language project roots, parse env flags, and emit hook responses. | `plugins/*-lang-hooks/scripts/common/hook.mjs` |
| C++ CMake helper | Finds the first supported CMake build directory with marker files. | `plugins/cpp-lang-hooks/scripts/common/cmake.mjs` |
| Rust/Python/JS failure helpers | Format blocking and retry-mode command failures with shared output trimming logic. | `plugins/python-lang-hooks/scripts/common/command_failure.mjs`, `plugins/rust-lang-hooks/scripts/common/command_failure.mjs`, `plugins/js-lang-hooks/scripts/common/command_failure.mjs` |
| Python runtime helper | Finds Python project roots, nearby virtualenvs, and executable commands. | `plugins/python-lang-hooks/scripts/common/python_runtime.mjs` |
| JS/TS runtime helper | Finds JS/TS project roots, package-manager metadata, package scripts, nearest `node_modules/.bin`, and executable commands. | `plugins/js-lang-hooks/scripts/common/node_runtime.mjs` |
| C++ post-edit hook | Deduplicates edited C/C++ paths, formats existing files, runs configurable `clang-tidy`, and marks turn state. | `plugins/cpp-lang-hooks/scripts/post_edit_hook.mjs` |
| C++ stop hook | Runs configurable `cmake --build` and `ctest` checks for CMake projects only when state says the current turn changed C/C++ files. | `plugins/cpp-lang-hooks/scripts/stop_hook.mjs` |
| C++ turn state | Stores per-turn C/C++ change flags in SQLite under `PLUGIN_DATA`. | `plugins/cpp-lang-hooks/scripts/common/turn_state.mjs` |
| Rust post-edit hook | Formats affected Cargo projects with `cargo fmt`, formats standalone `.rs` files with `rustfmt`, and marks turn state. | `plugins/rust-lang-hooks/scripts/post_edit_hook.mjs` |
| Rust stop hook | Runs configurable `cargo check`, strict `cargo clippy -- -D warnings`, and `cargo test` for affected Cargo projects. | `plugins/rust-lang-hooks/scripts/stop_hook.mjs` |
| Rust turn state | Stores per-turn Rust change flags and affected Cargo project directories in SQLite under `PLUGIN_DATA`. | `plugins/rust-lang-hooks/scripts/common/turn_state.mjs` |
| Python post-edit hook | Formats existing `.py`/`.pyi` files with the best available formatter family and marks Python code/config changes. | `plugins/python-lang-hooks/scripts/post_edit_hook.mjs` |
| Python stop hook | Runs configured typecheck, lint, and test checks for affected Python project roots. | `plugins/python-lang-hooks/scripts/stop_hook.mjs` |
| Python turn state | Stores per-turn Python change flags and affected Python project roots in SQLite under `PLUGIN_DATA`. | `plugins/python-lang-hooks/scripts/common/turn_state.mjs` |
| JS/TS post-edit hook | Formats existing JS/TS code files with `prettier` or `biome` and marks JS/TS code/config changes. | `plugins/js-lang-hooks/scripts/post_edit_hook.mjs` |
| JS/TS stop hook | Runs package-script-first typecheck, lint, and test checks for affected JS/TS project roots. | `plugins/js-lang-hooks/scripts/stop_hook.mjs` |
| JS/TS turn state | Stores per-turn JS/TS change flags and affected JS/TS project roots in SQLite under `PLUGIN_DATA`. | `plugins/js-lang-hooks/scripts/common/turn_state.mjs` |
| Test harness | Shares temp fixture setup, hook spawning, and SQLite inspection helpers across split test modules. | `tests/shared/runtime.mjs`, `tests/shared/sqlite.mjs`, `tests/*/helpers.mjs`, `tests/*/all.test.mjs` |

## Data Flow

1. A Codex edit tool triggers the C++ plugin `PostToolUse` hook.
2. `collectHookFilePaths()` extracts edited paths from `tool_input` or `apply_patch` content.
3. Paths are normalized and deduplicated; any mentioned C/C++ path records the turn as changed for `input.turn_id`.
4. Existing changed C/C++ files are formatted when enabled. `clang-tidy` runs on source files by default, with header tidy opt-in through `CPP_HOOKS_TIDY_HEADERS=1`.
5. A Codex `Stop` event invokes `stop_hook.mjs`.
6. The stop hook skips when disabled by env flags or when the current turn definitely has no C/C++ changes; otherwise it uses `findCMakeBuildDir()`, runs `cmake --build`, then runs `ctest`.

For Rust:

1. A Codex edit tool triggers the Rust plugin `PostToolUse` hook.
2. `collectHookFilePaths(input, cwd)` extracts normalized, deduplicated edited paths from `tool_input` or `apply_patch` content.
3. Any mentioned `.rs` path records the turn as Rust-changed for `input.turn_id`; paths under Cargo projects also record the nearest `Cargo.toml` directory.
4. Existing Rust files under Cargo projects are formatted once per affected project with `cargo fmt`; standalone existing `.rs` files are formatted with `rustfmt`.
5. Failed Rust formatting commands report shared command failure details, including labeled `stderr`/`stdout` when both streams exist and tail trimming controlled by `RUST_HOOKS_OUTPUT_MAX_CHARS`.
6. A Codex `Stop` event invokes the Rust stop hook.
7. Failed Rust Stop-hook Cargo commands use the same command failure detail formatter in either blocking responses or retry-mode system messages.
8. The stop hook skips when disabled by env flags, when there are no Rust changes, or when the turn only touched standalone Rust files; otherwise it runs `cargo check`, `cargo clippy -- -D warnings`, and `cargo test` in each affected Cargo project.

For Python:

1. A Codex edit tool triggers the Python plugin `PostToolUse` hook.
2. `collectHookFilePaths(input, cwd)` extracts normalized, deduplicated edited paths from `tool_input` or `apply_patch` content.
3. Any mentioned `.py`, `.pyi`, or known Python config path records the turn as Python-changed for `input.turn_id`; each path maps to the nearest Python project marker or its containing directory.
4. Existing `.py` and `.pyi` files are formatted with the first available formatter family: `ruff format`, `isort` plus `black`, then `yapf`.
5. Python tool resolution prefers executables in the nearest virtualenv directory (`.venv`, `venv`, `.env`, or `env`) before falling back to global `PATH`.
6. A Codex `Stop` event invokes the Python stop hook.
7. The stop hook skips when fast mode disables Stop checks, when there are no Python changes, or when no candidate tool exists for a category; otherwise it runs the first available type checker, linter, and test runner for each affected Python project root.
8. Normal Stop failures block on the first failed command; retry-mode Stop checks collect all command failures and return one combined `systemMessage`.

For JavaScript/TypeScript:

1. A Codex edit tool triggers the JS/TS plugin `PostToolUse` hook.
2. `collectHookFilePaths(input, cwd)` extracts normalized, deduplicated edited paths from `tool_input` or `apply_patch` content.
3. Any mentioned JS/TS code file or tracked JS/TS config path records the turn as JS-changed for `input.turn_id`; tracked config coverage includes common tool configs such as Vite, Rollup, Webpack, tsup, Babel, ESLint, Prettier, Vitest, and Jest; paths under a discovered project root also record that root.
4. Existing JS/TS code files are formatted per format root with `prettier --write` first, then `biome format --write` when `prettier` is unavailable, and those existing code files are also recorded for later Stop-hook lint-on-files behavior. Config files written in JS/TS, such as `vite.config.ts`, still participate in normal formatting because they are code files.
5. JS/TS runtime discovery prefers executables from the nearest `node_modules/.bin`, inspects `package.json` scripts for `typecheck`, `lint`, and `test`, detects the package manager from `packageManager` or lockfiles, builds manager-specific script invocations, preserves malformed `package.json` parse errors for the stop hook, and validates root `tsconfig*.json` / `jsconfig.json` with JSONC-style parsing.
6. A Codex `Stop` event invokes the JS/TS stop hook.
7. The stop hook skips when fast mode disables Stop checks, when there are no JS/TS changes, or when the turn touched only standalone JS files with no discoverable project root.
8. Otherwise, each affected JS/TS project root first blocks on malformed `package.json` content or malformed root `tsconfig*.json` / `jsconfig.json`, then runs enabled checks in order: package-script-first typecheck, package-script-first lint, and package-script-first test, with direct tool fallbacks for `tsc --noEmit`, touched-file `eslint` / `biome check`, and `vitest` / `jest` / `node --test`.
9. Normal Stop failures block on the first failed command; retry-mode Stop checks collect all command failures and return one combined `systemMessage`.

## Design Patterns

- Template Method style scaffolding: `create_language_hook_plugin.py` copies a fixed template and rewrites known metadata fields.
- Fail-open hook state: if `PLUGIN_DATA`, `turn_id`, or SQLite access is unavailable, the stop hook runs `ctest` rather than silently trusting missing state.
- Local host tool delegation: hooks call external language tools when installed and silently skip missing optional tools.
- Ordered CMake build discovery: hooks prefer `build/`, `cmake-build-debug/`, `cmake-build-release/`, then `out/build/` when those directories contain CMake marker files.
- Per-language shared helpers: reusable behavior such as CMake build-dir selection, Python runtime discovery, JS/TS runtime discovery, and Rust/Python/JS failure rendering lives under `scripts/common/` instead of being duplicated across hook entry points.
- Per-process hook caches: post-edit tidy checks cache nearest CMake project directories, build directory selection, and `compile_commands.json` presence during a single hook invocation.
- Python virtualenv/tool discovery caches nearest Python project roots, virtualenv directories, global `PATH` lookups, and resolved commands during a single hook invocation.
- JS/TS runtime caches nearest project roots, package-manager metadata, package-script lookups, local `node_modules/.bin` paths, global `PATH` lookups, and resolved commands during a single hook invocation.
- JS/TS Stop behavior now depends on both per-turn project-root state and per-turn touched code-file state so direct-tool lint can stay file-scoped.

## Security Boundaries

- Hook scripts execute local commands (`clang-format`, `clang-tidy`, `cmake`, `ctest`, `cargo`, `rustfmt`, Python tooling, JS/TS tooling, and package managers) against repository files, so they should keep arguments structured and avoid shell interpolation.
- Plugin state is stored only under `PLUGIN_DATA`; repository files are not used for runtime hook state.
- Environment flags primarily enable or disable local checks; Rust, Python, and JS/TS also expose output-limit flags to bound failed command output included in hook messages.
- The generator writes to `plugins/` and `.agents/plugins/marketplace.json`; it validates plugin names and JSON object shapes before writing.
