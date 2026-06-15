---
sources:
  - "README.md"
  - "scripts/*.py"
  - "plugins/**/*.mjs"
  - "plugins/**/*.json"
  - "templates/**/*.mjs"
  - "templates/**/*.json"
  - "tests/**/*.mjs"
---

# Toolchain & Dev Setup

## Build System

| Tool | Command | Output |
|------|---------|--------|
| Python script | `python3 scripts/create_language_hook_plugin.py "<NAME>"` | New plugin directory under `plugins/` plus marketplace entry. |
| Node.js | `node <HOOK_SCRIPT>` | Hook JSON response on stdout. |

There is no compile or bundle step for the repository itself.

## Linting & Formatting

| Tool | Config file | Run command |
|------|-------------|-------------|
| Node syntax checker | N/A | `node --check <FILE>.mjs` |
| `clang-format` | C++ project config if present | Invoked automatically by `post_edit_hook.mjs` for existing changed C/C++ files when enabled. |
| `clang-tidy` | C++ project config / selected build directory `compile_commands.json` if present | Invoked automatically by `post_edit_hook.mjs` for changed source files when enabled; headers require opt-in. |
| `cargo fmt` | Rust project config if present | Invoked automatically by the Rust post-edit hook once per affected Cargo project when enabled. |
| `rustfmt` | Rustfmt config if present | Invoked automatically by the Rust post-edit hook for standalone `.rs` files outside Cargo projects when enabled. |
| `cargo clippy` | Rust project config if present | Invoked automatically by the Rust stop hook with `-- -D warnings` when enabled. |
| `ruff format` | Python project config if present | Preferred Python post-edit formatter for existing `.py` and `.pyi` files when available. |
| `black` + optional `isort` | Python project config if present | Python post-edit formatter fallback when `ruff` is unavailable; `isort` runs first when available. |
| `yapf` | Python project config if present | Python post-edit formatter fallback when `ruff` and `black` are unavailable. |
| Python type checkers | Tool-specific config if present | Python Stop hook selects the first available of `ty`, `pyre`, `pyright`, then `mypy`. |
| Python linters | Tool-specific config if present | Python Stop hook selects the first available of `ruff check` then `pylint`. |
| Python test runners | Project test config if present | Python Stop hook runs `pytest` when available, otherwise `python -m unittest discover`. |
| `prettier` | JavaScript/TypeScript project config if present | Preferred JS/TS post-edit formatter for existing code files when available. |
| `biome format` / `biome check` | JavaScript/TypeScript project config if present | JS/TS formatter fallback and linter fallback when `prettier` or `eslint` are unavailable. |
| `eslint` | JavaScript/TypeScript project config if present | JS/TS Stop hook lint fallback when no package `lint` script exists; runs on touched code files instead of `.`. |
| `tsc --noEmit` | TypeScript project config if present | JS/TS Stop hook typecheck fallback when no package `typecheck` script exists; root `tsconfig*.json` / `jsconfig.json` is validated first with JSONC-aware parsing. |
| JS/TS package scripts | `package.json` scripts and local package manager | JS/TS Stop hook prefers `typecheck`, `lint`, and `test` scripts over direct tool fallbacks, uses manager-specific invocation forms (`npm run`, `pnpm run`, `yarn <script>`, `bun run`), blocks when a discovered `package.json` is malformed, blocks when root `tsconfig*.json` / `jsconfig.json` is malformed, and still allows script-based lint on config-only turns. |
| JS/TS test runners | Tool-specific config if present | JS/TS Stop hook falls back to `vitest run`, `jest --runInBand`, then `node --test`. |

No repository-level JavaScript or Python formatter config is present.

## Testing

| Aspect | Detail |
|--------|--------|
| Framework | Node built-in test runner |
| Main commands | `node --test tests/all.test.mjs`; focused suites can also target `tests/cpp-lang-hooks/post_edit_state.test.mjs`, `tests/cpp-lang-hooks/post_edit_tools.test.mjs`, `tests/cpp-lang-hooks/stop_hook.test.mjs`, `tests/rust-lang-hooks/post_edit.test.mjs`, `tests/rust-lang-hooks/stop_hook.test.mjs`, `tests/rust-lang-hooks/failure_output.test.mjs`, `tests/python-lang-hooks/post_edit_detection.test.mjs`, `tests/python-lang-hooks/post_edit_formatting.test.mjs`, `tests/python-lang-hooks/python_runtime.test.mjs`, `tests/python-lang-hooks/retry_and_output.test.mjs`, `tests/python-lang-hooks/stop_hook.test.mjs`, `tests/js-lang-hooks/post_edit_detection.test.mjs`, `tests/js-lang-hooks/post_edit_formatting.test.mjs`, `tests/js-lang-hooks/node_runtime.test.mjs`, `tests/js-lang-hooks/retry_and_output.test.mjs`, and `tests/js-lang-hooks/stop_hook.test.mjs` |
| Coverage target | Not specified in repo config |
| Integration style | Tests spawn hook scripts with JSON stdin, temp language-project fixtures, fake host tools, temp `PLUGIN_DATA`, and shared harness helpers from `tests/shared/`. |

## CI/CD Pipeline

No `.github/workflows/`, Dockerfile, or deployment pipeline files are present. Verification is currently local/manual.

## Development Environment

| Requirement | Value |
|-------------|-------|
| Node.js | Required for hook scripts and tests; Node 24.x is used locally because the C++ hook state helper imports `node:sqlite`. |
| Python | Required for `scripts/create_language_hook_plugin.py`. |
| Optional C++ tools | `clang-format`, `clang-tidy`, `cmake`, `ctest`, and CMake build output for C++ projects using the plugin. |
| Optional Rust tools | `cargo` and `rustfmt` for Rust projects or standalone Rust files using the plugin. |
| Optional Python tools | `ruff`, `black`, `isort`, `yapf`, `ty`, `pyre`, `pyright`, `mypy`, `pylint`, `pytest`, and `python`/`python3` for projects using the plugin. |
| Optional JS/TS tools | `prettier`, `biome`, `eslint`, `tsc`, `vitest`, `jest`, `node`, and package managers such as `npm`, `pnpm`, `yarn`, or `bun` for projects using the plugin. |
| Environment variables | `PLUGIN_ROOT` is used by hook config; `PLUGIN_DATA` stores hook errors and SQLite state; `CPP_HOOKS_*`, `RUST_HOOKS_*`, `PYTHON_HOOKS_*`, and `JS_HOOKS_*` flags control optional checks. |

## C++ Hook Environment Flags

| Variable | Behavior |
|----------|----------|
| `CPP_HOOKS_CLANG_FORMAT=0` | Skip `clang-format`. |
| `CPP_HOOKS_CLANG_TIDY=0` | Skip `clang-tidy`. |
| `CPP_HOOKS_TIDY_HEADERS=1` | Run `clang-tidy` on headers as well as source files. |
| `CPP_HOOKS_CTEST=0` | Skip Stop-hook CMake build and `ctest`. |
| `CPP_HOOKS_FAST=1` | Skip `clang-tidy` and Stop-hook CMake/CTest while keeping `clang-format`. |

## Rust Hook Environment Flags

| Variable | Behavior |
|----------|----------|
| `RUST_HOOKS_CARGO_FMT=0` | Skip Cargo-project `cargo fmt`. |
| `RUST_HOOKS_RUSTFMT=0` | Skip standalone-file `rustfmt`. |
| `RUST_HOOKS_CARGO_CHECK=0` | Skip `cargo check`. |
| `RUST_HOOKS_CARGO_CLIPPY=0` | Skip `cargo clippy -- -D warnings`. |
| `RUST_HOOKS_CARGO_TEST=0` | Skip `cargo test`. |
| `RUST_HOOKS_FAST=1` | Skip Rust Stop-hook Cargo checks while keeping formatting. |
| `RUST_HOOKS_OUTPUT_MAX_CHARS=<n>` | Limit failed Rust tool output in hook responses to the last `<n>` characters; invalid values fall back to 4000. |

## Python Hook Environment Flags

| Variable | Behavior |
|----------|----------|
| `PYTHON_HOOKS_FORMAT=0` | Skip Python post-edit formatting. |
| `PYTHON_HOOKS_TYPECHECK=0` | Skip Python Stop-hook type checking. |
| `PYTHON_HOOKS_LINT=0` | Skip Python Stop-hook linting. |
| `PYTHON_HOOKS_TEST=0` | Skip Python Stop-hook test execution. |
| `PYTHON_HOOKS_FAST=1` | Skip Python Stop-hook typecheck/lint/test checks while keeping formatting. |
| `PYTHON_HOOKS_OUTPUT_MAX_CHARS=<n>` | Limit failed Python tool output in hook responses to the last `<n>` characters; invalid values fall back to 4000. |

## JavaScript/TypeScript Hook Environment Flags

| Variable | Behavior |
|----------|----------|
| `JS_HOOKS_FORMAT=0` | Skip JS/TS post-edit formatting. |
| `JS_HOOKS_TYPECHECK=0` | Skip JS/TS Stop-hook type checking. |
| `JS_HOOKS_LINT=0` | Skip JS/TS Stop-hook linting. |
| `JS_HOOKS_TEST=0` | Skip JS/TS Stop-hook test execution. |
| `JS_HOOKS_FAST=1` | Skip JS/TS Stop-hook typecheck/lint/test checks while keeping formatting. |
| `JS_HOOKS_OUTPUT_MAX_CHARS=<n>` | Limit failed JS/TS tool output in hook responses to the last `<n>` characters; invalid values fall back to 4000. |
