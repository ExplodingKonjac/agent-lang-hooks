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
| C++ CMake helper | `plugins/cpp-lang-hooks/scripts/common/cmake.mjs` | Selects the first supported CMake build directory for `clang-tidy`, `cmake --build`, and `ctest`. |
| C++ post-edit hook | `plugins/cpp-lang-hooks/scripts/post_edit_hook.mjs` | Processes edited C/C++ files after edit tools. |
| C++ stop hook | `plugins/cpp-lang-hooks/scripts/stop_hook.mjs` | Runs or skips `ctest` at turn stop. |
| Rust failure helper | `plugins/rust-lang-hooks/scripts/common/command_failure.mjs` | Formats blocking and retry-mode command failures with bounded output. |
| Rust post-edit hook | `plugins/rust-lang-hooks/scripts/post_edit_hook.mjs` | Processes edited Rust files after edit tools. |
| Rust stop hook | `plugins/rust-lang-hooks/scripts/stop_hook.mjs` | Runs or skips Cargo checks at turn stop. |
| Python failure helper | `plugins/python-lang-hooks/scripts/common/command_failure.mjs` | Formats blocking and retry-mode command failures with bounded output. |
| Python runtime helper | `plugins/python-lang-hooks/scripts/common/python_runtime.mjs` | Resolves Python project roots, nearby virtualenvs, and executable tool commands. |
| Python post-edit hook | `plugins/python-lang-hooks/scripts/post_edit_hook.mjs` | Processes edited Python files and Python config files after edit tools. |
| Python stop hook | `plugins/python-lang-hooks/scripts/stop_hook.mjs` | Runs or skips Python typecheck, lint, and test checks at turn stop. |
| JS/TS failure helper | `plugins/js-lang-hooks/scripts/common/command_failure.mjs` | Formats blocking and retry-mode command failures with bounded output. |
| JS/TS runtime helper | `plugins/js-lang-hooks/scripts/common/node_runtime.mjs` | Resolves JS/TS project roots, package managers, package scripts, local tool commands, and TypeScript config presence. |
| JS/TS post-edit hook | `plugins/js-lang-hooks/scripts/post_edit_hook.mjs` | Processes edited JS/TS files and JS/TS config files after edit tools. |
| JS/TS stop hook | `plugins/js-lang-hooks/scripts/stop_hook.mjs` | Runs or skips JS/TS typecheck, lint, and test checks at turn stop. |
| C++ hook test suite | `tests/cpp-lang-hooks/all.test.mjs` | Aggregates C++ hook test modules that exercise hook scripts through child processes. |
| Rust hook test suite | `tests/rust-lang-hooks/all.test.mjs` | Aggregates Rust hook test modules that exercise hook scripts through child processes. |
| Python hook test suite | `tests/python-lang-hooks/all.test.mjs` | Aggregates Python hook test modules and direct Python helper coverage. |
| JS/TS hook test suite | `tests/js-lang-hooks/all.test.mjs` | Aggregates JS/TS hook test modules and direct runtime-helper coverage. |
| Shared test harness | `tests/shared/runtime.mjs`, `tests/shared/sqlite.mjs` | Spawns hook scripts, writes fake tools, and inspects SQLite state in tests. |

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
- Each turn-state helper also parses positive integer state-retention env flags for retention hours, max retained turns, and prune interval, falling back to defaults when values are unset, invalid, or non-positive.
- Rust and Python `commandFailureDetails()` helpers format failed command output, prefer process errors, preserve both `stderr` and `stdout` with labels when both exist, fall back to exit status when output is empty, and trim long output to the configured tail.
- `markCppChanged()` upserts `cpp_changed = 1` for a turn in SQLite.
- `markCppChanged()` opportunistically prunes stale or overflow C++ rows after a successful write, throttled by metadata stored in the same SQLite DB.
- `didCppChange()` returns `true` for known C++ changes, `false` for known no-change rows/missing rows, and `null` when state cannot be trusted.
- `stop_hook.mjs` skips CMake checks when `CPP_HOOKS_CTEST=0`, when `CPP_HOOKS_FAST=1`, or on a definite no-change state; otherwise it runs `cmake --build` before `ctest` when a supported build directory is found.
- Rust `post_edit_hook.mjs` filters normalized `.rs` paths, records any Rust edit for turn state, and records nearest Cargo project directories when a `Cargo.toml` ancestor exists.
- Rust post-edit formatting uses `cargo fmt` once per affected Cargo project and `rustfmt` for existing standalone `.rs` files outside Cargo projects.
- Rust `stop_hook.mjs` runs enabled Cargo commands in order: `cargo check`, `cargo clippy -- -D warnings`, then `cargo test`.
- Failed Rust post-edit and Stop-hook command messages share `commandFailureDetails()` so blocking reasons and retry-mode system messages have the same output trimming and stream labeling.
- `RUST_HOOKS_CARGO_FMT`, `RUST_HOOKS_RUSTFMT`, `RUST_HOOKS_CARGO_CHECK`, `RUST_HOOKS_CARGO_CLIPPY`, `RUST_HOOKS_CARGO_TEST`, and `RUST_HOOKS_FAST` control Rust hook behavior.
- `RUST_HOOKS_OUTPUT_MAX_CHARS` controls how much failed Rust command output is included in hook messages; invalid values fall back to 4000 characters.
- Rust stop checks fail open to the current Cargo project when turn state is unavailable; known standalone-only Rust edits skip Stop Cargo checks.
- Python `post_edit_hook.mjs` treats `.py`, `.pyi`, and known Python config filenames as Python changes for turn state.
- Python post-edit formatting applies only to existing `.py` and `.pyi` files, using formatter priority `ruff format`, `isort` plus `black`, then `yapf`.
- Python project root discovery uses markers such as `pyproject.toml`, `setup.cfg`, `setup.py`, test configs, type-checker configs, and Ruff/Pylint configs, falling back to the path's containing directory.
- Python command resolution searches upward for `.venv`, `venv`, `.env`, or `env`, prefers executable tools inside that virtualenv, and falls back to global `PATH`.
- Python helper caches memoize nearest project roots, nearest virtualenvs, global `PATH` command lookups, and resolved `(command, startDir)` results for one hook process.
- `markPythonChanged()` upserts `python_changed = 1` for a turn and records affected Python project roots in SQLite.
- `markPythonChanged()` opportunistically prunes stale or overflow Python rows after a successful write and deletes related `turn_python_projects` rows for removed turns.
- `getPythonTurnState()` returns known Python changes and project roots, known no-change state, or `null` when state cannot be trusted.
- Python `stop_hook.mjs` runs enabled Stop commands in order: first available type checker (`ty`, `pyre`, `pyright`, `mypy`), first available linter (`ruff check`, `pylint`), then first available test runner (`pytest`, `python -m unittest discover`).
- Python normal Stop mode blocks on the first failed command, while retry mode runs all checks for all affected project roots and returns a combined `systemMessage` for every failure.
- `PYTHON_HOOKS_FORMAT`, `PYTHON_HOOKS_TYPECHECK`, `PYTHON_HOOKS_LINT`, `PYTHON_HOOKS_TEST`, and `PYTHON_HOOKS_FAST` control Python hook behavior.
- `PYTHON_HOOKS_OUTPUT_MAX_CHARS` controls how much failed Python command output is included in hook messages; invalid values fall back to 4000 characters.
- JS/TS `post_edit_hook.mjs` treats `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`, and tracked JS/TS config files as JS changes for turn state.
- Tracked JS/TS config coverage includes common tool configs such as `vite.config.*`, `rollup.config.*`, `webpack.config.*`, `tsup.config.*`, `babel.config.*`, and `.babelrc*`, in addition to the existing package / tsconfig / lint / format / test config set.
- JS/TS post-edit formatting applies only to existing code files, using formatter priority `prettier --write` then `biome format --write`.
- JS/TS post-edit processing also records touched existing code files in SQLite so Stop-hook direct lint fallbacks can operate on file arguments instead of `.`.
- JS/TS project root discovery uses nearest `package.json`, TS/JS config files, Biome/ESLint/Prettier/Vitest/Jest configs, richer build-tool configs such as Vite/Rollup/Webpack/tsup/Babel, and common lockfiles; standalone formatting falls back to the path's containing directory.
- JS/TS command resolution searches upward for the nearest `node_modules/.bin`, prefers local executables there, and falls back to global `PATH`.
- JS/TS helper caches memoize nearest project roots, package manager detection, package script presence, malformed `package.json` parse state, local bin directories, global `PATH` command lookups, and resolved `(command, startDir)` results for one hook process.
- JS/TS package-script resolution now builds manager-specific commands: `npm run <script>`, `pnpm run <script>`, `yarn <script>`, and `bun run <script>`.
- JS/TS root config validation parses `tsconfig*.json` and `jsconfig.json` with JSONC-style comment and trailing-comma support, and reports malformed configs before Stop command selection.
- `markJsChanged()` upserts `js_changed = 1` for a turn and records affected JS/TS project roots plus touched existing code files in SQLite.
- `markJsChanged()` opportunistically prunes stale or overflow JS/TS rows after a successful write and deletes related `turn_js_projects` and `turn_js_files` rows for removed turns.
- `getJsTurnState()` returns known JS changes, project roots, and lint-file paths, known no-change state, or `null` when state cannot be trusted.
- JS/TS `stop_hook.mjs` blocks on malformed discovered `package.json` content or malformed root `tsconfig*.json` / `jsconfig.json` before command selection, then runs enabled Stop commands in order: package-script-first `typecheck`, `lint`, and `test`, then direct fallbacks `tsc --noEmit`, touched-file `eslint` / `biome check`, and `vitest run` / `jest --runInBand` / `node --test`.
- When `PLUGIN_DATA` state is unavailable, JS/TS Stop hooks still fail open for root-scoped checks, but direct-tool lint fallback is suppressed because touched-file state is unavailable.
- JS/TS normal Stop mode blocks on the first failed command, while retry mode runs all checks for all affected project roots and returns a combined `systemMessage` for every failure.
- `JS_HOOKS_FORMAT`, `JS_HOOKS_TYPECHECK`, `JS_HOOKS_LINT`, `JS_HOOKS_TEST`, and `JS_HOOKS_FAST` control JS/TS hook behavior.
- `JS_HOOKS_OUTPUT_MAX_CHARS` controls how much failed JS/TS command output is included in hook messages; invalid values fall back to 4000 characters.

## Error Handling Strategy

- Hook scripts emit blocking JSON when a required command fails.
- Rust, Python, and JS/TS required-tool failures include bounded command details so large stdout/stderr payloads do not flood hook responses.
- Missing `clang-format`, `clang-tidy`, `cmake`, `ctest`, `cargo`, or `rustfmt` binaries are treated as non-blocking.
- Missing JS/TS tools such as `prettier`, `biome`, `eslint`, `tsc`, `vitest`, `jest`, or a package manager are treated as non-blocking fallbacks to the next candidate or category skip.
- Disabled checks return successful hook output without invoking their corresponding host tools.
- Shared hook errors are logged to `${PLUGIN_DATA}/hook_errors.log` when possible.
- SQLite failures are swallowed by state helpers and represented as `false` or `null`, so hooks keep developer flow moving.
- The Python generator raises explicit errors for invalid plugin names, invalid JSON shapes, missing templates, or duplicate target directories.

## Testing Strategy

| Test level | Location | What it covers |
|------------|----------|----------------|
| Cross-language aggregation | `tests/all.test.mjs` | Loads each language suite and asserts every plugin `scripts/common/hook.mjs` still matches the template copy exactly. |
| C++ hook integration | `tests/cpp-lang-hooks/post_edit_state.test.mjs`, `tests/cpp-lang-hooks/post_edit_tools.test.mjs`, `tests/cpp-lang-hooks/stop_hook.test.mjs` | Post-edit state marking, deleted/moved C++ paths, path dedupe, header tidy defaults, env toggles, build directory selection, stop-hook build/test decisions, missing `turn_id`, and missing `PLUGIN_DATA`. |
| Rust hook integration | `tests/rust-lang-hooks/post_edit.test.mjs`, `tests/rust-lang-hooks/stop_hook.test.mjs`, `tests/rust-lang-hooks/failure_output.test.mjs` | Cargo-project and standalone Rust formatting, deleted Rust paths, path/project dedupe, env toggles, strict Clippy stop checks, stop-hook Cargo command decisions, long output trimming, both-stream labeling, retry-mode messages, and empty-output exit-status fallback. |
| Python hook integration | `tests/python-lang-hooks/post_edit_detection.test.mjs`, `tests/python-lang-hooks/post_edit_formatting.test.mjs`, `tests/python-lang-hooks/python_runtime.test.mjs`, `tests/python-lang-hooks/retry_and_output.test.mjs`, `tests/python-lang-hooks/stop_hook.test.mjs` | Python formatting, `.pyi` and config change detection, formatter priority, virtualenv preference, Stop command selection, env toggles, retry aggregation, command-resolution memoization, and bounded failure-output reporting. |
| JS/TS hook integration | `tests/js-lang-hooks/post_edit_detection.test.mjs`, `tests/js-lang-hooks/post_edit_formatting.test.mjs`, `tests/js-lang-hooks/node_runtime.test.mjs`, `tests/js-lang-hooks/retry_and_output.test.mjs`, `tests/js-lang-hooks/stop_hook.test.mjs` | JS/TS formatting, config change detection including richer tool config coverage, formatter priority, local `node_modules/.bin` preference, package-manager and package-script detection, manager-specific script invocation, malformed `package.json` blocking behavior, JSONC-aware malformed `tsconfig*.json` / `jsconfig.json` blocking behavior, touched-file lint state persistence, file-scoped Stop lint selection, env toggles, retry aggregation, standalone-file skip logic, and bounded failure-output reporting. |
| Shared test helpers | `tests/*/helpers.mjs`, `tests/shared/runtime.mjs`, `tests/shared/sqlite.mjs` | Fixture creation, fake tool wiring, hook spawning, and SQLite state inspection. |
| Manual syntax | N/A | `node --check` for hook scripts and tests. |
| Generator smoke | N/A | Not currently covered by automated tests. |

## Performance Considerations

- The stateful stop hook avoids running CMake build/test commands on turns without C/C++ edits.
- `CPP_HOOKS_FAST=1` skips `clang-tidy` and Stop-hook CMake/CTest checks while keeping formatting.
- Post-edit CMake project discovery, build directory selection, and `compile_commands.json` checks are cached within each hook process.
- SQLite connections are opened per state operation and closed immediately, keeping hook code simple and isolated.
- State pruning is throttled by per-DB metadata and runs only on write paths, so read-only Stop-hook lookups keep their previous cost profile.
- Hook file detection filters and deduplicates known C/C++ paths before invoking external tooling.
- Rust Stop checks only run for affected Cargo projects, avoiding `cargo check`/`clippy`/`test` for turns that only touch standalone Rust files.
- Rust, Python, and JS/TS child tables are pruned together with their parent turn rows, preventing related project/file rows from accumulating indefinitely.
- Rust failure output is capped to the last 4000 characters by default, or to the positive integer configured in `RUST_HOOKS_OUTPUT_MAX_CHARS`.
- Python Stop checks only run for affected Python project roots, avoiding typecheck/lint/test work on turns without Python code or config changes.
- Python formatter and Stop command resolution caches avoid repeated upward virtualenv/project-root walks and repeated global `PATH` scans within one hook process.
- Python failure output is capped to the last 4000 characters by default, or to the positive integer configured in `PYTHON_HOOKS_OUTPUT_MAX_CHARS`.
- JS/TS Stop checks only run for affected JS/TS project roots, avoiding typecheck/lint/test work on turns without tracked JS/TS code or config changes.
- JS/TS direct-tool lint fallbacks now operate on touched files instead of `.` to reduce Stop latency for large projects.
- JS/TS runtime caches avoid repeated upward project-root walks, package-manager/script inspection, local `node_modules/.bin` discovery, and repeated global `PATH` scans within one hook process.
- JS/TS failure output is capped to the last 4000 characters by default, or to the positive integer configured in `JS_HOOKS_OUTPUT_MAX_CHARS`.
