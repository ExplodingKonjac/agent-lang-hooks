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

No repository-level JavaScript or Python formatter config is present.

## Testing

| Aspect | Detail |
|--------|--------|
| Framework | Node built-in test runner |
| Main commands | `node --test tests/cpp-lang-hooks/stateful_hooks.test.mjs`; `node --test tests/rust-lang-hooks/stateful_hooks.test.mjs` |
| Coverage target | Not specified in repo config |
| Integration style | Tests spawn hook scripts with JSON stdin, temp language-project fixtures, fake host tools, and temp `PLUGIN_DATA`. |

## CI/CD Pipeline

No `.github/workflows/`, Dockerfile, or deployment pipeline files are present. Verification is currently local/manual.

## Development Environment

| Requirement | Value |
|-------------|-------|
| Node.js | Required for hook scripts and tests; Node 24.x is used locally because the C++ hook state helper imports `node:sqlite`. |
| Python | Required for `scripts/create_language_hook_plugin.py`. |
| Optional C++ tools | `clang-format`, `clang-tidy`, `cmake`, `ctest`, and CMake build output for C++ projects using the plugin. |
| Optional Rust tools | `cargo` and `rustfmt` for Rust projects or standalone Rust files using the plugin. |
| Environment variables | `PLUGIN_ROOT` is used by hook config; `PLUGIN_DATA` stores hook errors and SQLite state; `CPP_HOOKS_*` and `RUST_HOOKS_*` flags control optional checks. |

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
