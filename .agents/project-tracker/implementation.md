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
| Plugin generator CLI | `scripts/create_language_hook_plugin.py` | Creates a new plugin from `templates/language-hook-template/` and updates marketplace metadata. |
| C++ post-edit hook | `plugins/cpp-lang-hooks/scripts/post_edit_hook.mjs` | Processes edited C/C++ files after edit tools. |
| C++ stop hook | `plugins/cpp-lang-hooks/scripts/stop_hook.mjs` | Runs or skips `ctest` at turn stop. |
| Rust post-edit hook | `plugins/rust-lang-hooks/scripts/post_edit_hook.mjs` | Processes edited Rust files after edit tools. |
| Rust stop hook | `plugins/rust-lang-hooks/scripts/stop_hook.mjs` | Runs or skips Cargo checks at turn stop. |
| C++ hook test suite | `tests/cpp-lang-hooks/stateful_hooks.test.mjs` | Exercises C++ hook scripts through child processes. |
| Rust hook test suite | `tests/rust-lang-hooks/stateful_hooks.test.mjs` | Exercises Rust hook scripts through child processes. |

## Key Algorithms & Logic

- `normalize_name()` lowercases plugin names, replaces non-alphanumeric runs with `-`, trims separators, and enforces a 64-character limit.
- `collectHookFilePaths(input, cwd)` supports ordinary edit tool inputs and parses `apply_patch` headers, including file moves.
- `collectHookFilePaths(input, cwd)` resolves relative paths against `cwd`, normalizes paths, and deduplicates equivalent path strings before callers filter by language extension.
- `collectHookFilePaths()` keeps both source and destination paths for moves, allowing deleted or moved-away C/C++ files to mark a turn as changed.
- C++ `post_edit_hook.mjs` filters normalized C/C++ paths before running tools, so equivalent paths like `main.cpp` and `./main.cpp` are processed once.
- C++ source extensions (`.c`, `.cc`, `.cpp`, `.cxx`) and header extensions (`.h`, `.hh`, `.hpp`) are tracked separately; headers are formatted by default but only tidied when `CPP_HOOKS_TIDY_HEADERS=1`.
- `findCMakeBuildDir()` searches `build/`, `cmake-build-debug/`, `cmake-build-release/`, and `out/build/`, choosing the first directory with CMake marker files.
- `runClangTidy()` finds the nearest `CMakeLists.txt`, then uses the selected build directory when it contains `compile_commands.json`; these lookups are cached for the duration of one hook process.
- `envFlag()` and `envEnabled()` parse `CPP_HOOKS_*` flags; only `"1"` explicitly enables opt-in flags and only `"0"` explicitly disables default-on checks.
- `envInt()` parses positive integer environment values and falls back to the caller's default when unset, invalid, or non-positive.
- `commandFailureDetails()` formats failed Rust command output, preferring process errors, preserving both `stderr` and `stdout` with labels when both exist, falling back to exit status when output is empty, and trimming long output to the configured tail.
- `markCppChanged()` upserts `cpp_changed = 1` for a turn in SQLite.
- `didCppChange()` returns `true` for known C++ changes, `false` for known no-change rows/missing rows, and `null` when state cannot be trusted.
- `stop_hook.mjs` skips CMake checks when `CPP_HOOKS_CTEST=0`, when `CPP_HOOKS_FAST=1`, or on a definite no-change state; otherwise it runs `cmake --build` before `ctest` when a supported build directory is found.
- Rust `post_edit_hook.mjs` filters normalized `.rs` paths, records any Rust edit for turn state, and records nearest Cargo project directories when a `Cargo.toml` ancestor exists.
- Rust post-edit formatting uses `cargo fmt` once per affected Cargo project and `rustfmt` for existing standalone `.rs` files outside Cargo projects.
- Rust `stop_hook.mjs` runs enabled Cargo commands in order: `cargo check`, `cargo clippy -- -D warnings`, then `cargo test`.
- Failed Rust post-edit and Stop-hook command messages share `commandFailureDetails()` so blocking reasons and retry-mode system messages have the same output trimming and stream labeling.
- `RUST_HOOKS_CARGO_FMT`, `RUST_HOOKS_RUSTFMT`, `RUST_HOOKS_CARGO_CHECK`, `RUST_HOOKS_CARGO_CLIPPY`, `RUST_HOOKS_CARGO_TEST`, and `RUST_HOOKS_FAST` control Rust hook behavior.
- `RUST_HOOKS_OUTPUT_MAX_CHARS` controls how much failed Rust command output is included in hook messages; invalid values fall back to 4000 characters.
- Rust stop checks fail open to the current Cargo project when turn state is unavailable; known standalone-only Rust edits skip Stop Cargo checks.

## Error Handling Strategy

- Hook scripts emit blocking JSON when a required command fails.
- Rust required-tool failures include bounded command details so large stdout/stderr payloads do not flood hook responses.
- Missing `clang-format`, `clang-tidy`, `cmake`, `ctest`, `cargo`, or `rustfmt` binaries are treated as non-blocking.
- Disabled checks return successful hook output without invoking their corresponding host tools.
- Shared hook errors are logged to `${PLUGIN_DATA}/hook_errors.log` when possible.
- SQLite failures are swallowed by state helpers and represented as `false` or `null`, so hooks keep developer flow moving.
- The Python generator raises explicit errors for invalid plugin names, invalid JSON shapes, missing templates, or duplicate target directories.

## Testing Strategy

| Test level | Location | What it covers |
|------------|----------|----------------|
| C++ hook integration | `tests/cpp-lang-hooks/stateful_hooks.test.mjs` | Post-edit state marking, deleted/moved C++ paths, path dedupe, header tidy defaults, env toggles, build directory selection, stop-hook build/test decisions, missing `turn_id`, and missing `PLUGIN_DATA`. |
| Rust hook integration | `tests/rust-lang-hooks/stateful_hooks.test.mjs` | Cargo-project and standalone Rust formatting, deleted Rust paths, path/project dedupe, env toggles, strict Clippy stop checks, stop-hook Cargo command decisions, missing `turn_id`, and missing `PLUGIN_DATA`. |
| Rust failure-output integration | `tests/rust-lang-hooks/stateful_hooks.test.mjs` | Long output trimming, invalid output-limit fallback, combined stdout/stderr labeling, retry-mode Stop-hook messages, and empty-output exit-status fallback. |
| Manual syntax | N/A | `node --check` for hook scripts and tests. |
| Generator smoke | N/A | Not currently covered by automated tests. |

## Performance Considerations

- The stateful stop hook avoids running CMake build/test commands on turns without C/C++ edits.
- `CPP_HOOKS_FAST=1` skips `clang-tidy` and Stop-hook CMake/CTest checks while keeping formatting.
- Post-edit CMake project discovery, build directory selection, and `compile_commands.json` checks are cached within each hook process.
- SQLite connections are opened per state operation and closed immediately, keeping hook code simple and isolated.
- Hook file detection filters and deduplicates known C/C++ paths before invoking external tooling.
- Rust Stop checks only run for affected Cargo projects, avoiding `cargo check`/`clippy`/`test` for turns that only touch standalone Rust files.
- Rust failure output is capped to the last 4000 characters by default, or to the positive integer configured in `RUST_HOOKS_OUTPUT_MAX_CHARS`.
