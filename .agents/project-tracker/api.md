---
sources:
  - "README.md"
  - "scripts/*.py"
  - "plugins/**/*.json"
  - "plugins/**/*.mjs"
---

# API Reference

## Network API

N/A — this repository does not define a network API, HTTP server, route handlers, OpenAPI schema, authentication layer, rate limits, or pagination behavior.

## Local Interfaces

| Interface | Input | Output | Description |
|-----------|-------|--------|-------------|
| Codex hook command | Hook JSON on stdin | Hook decision JSON on stdout | `post_edit_hook.mjs` and `stop_hook.mjs` implement Codex hook behavior. |
| Plugin generator CLI | Plugin name and optional `--non-interactive` | New plugin directory and marketplace update | `scripts/create_language_hook_plugin.py` scaffolds language plugins. |
| C++ build-dir helper | CMake project directory | First supported build directory or `null` | `plugins/cpp-lang-hooks/scripts/common/cmake.mjs` centralizes build-dir discovery for C++ hooks. |
| Rust/Python failure formatter | `spawnSync()` result plus optional env override | Bounded failure-detail string | `plugins/*-lang-hooks/scripts/common/command_failure.mjs` standardizes labeled stderr/stdout output, exit-status fallback, and tail trimming. |
| Python runtime helper | File path or start directory | Project root / resolved command metadata | `plugins/python-lang-hooks/scripts/common/python_runtime.mjs` resolves Python project roots, nearby virtualenvs, and tool commands. |
| C++ hook environment flags | `CPP_HOOKS_*` environment variables | Selected local checks are enabled or skipped | Controls format, tidy, header tidy, Stop-hook CTest, and fast mode behavior. |
| Rust hook environment flags | `RUST_HOOKS_*` environment variables | Selected local checks and failure-output size are configured | Controls Cargo formatting, standalone `rustfmt`, Cargo Stop checks, fast mode behavior, and output trimming. |
| Python hook environment flags | `PYTHON_HOOKS_*` environment variables | Selected local checks and failure-output size are configured | Controls Python formatting, type checking, linting, tests, fast mode behavior, and output trimming. |

## Request / Response Shapes

Hook scripts consume Codex-provided hook input objects. They emit compact JSON objects such as:

```json
{
  "continue": true
}
```

or blocking decisions when a required tool fails:

```json
{
  "decision": "block",
  "reason": "ctest failed: <DETAILS>"
}
```

Retry-mode Stop hooks can also emit a non-blocking combined failure report:

```json
{
  "continue": true,
  "systemMessage": "typecheck failed: <DETAILS>\n\nlint failed: <DETAILS>"
}
```

Supported C++ hook flags:

| Variable | Effect |
|----------|--------|
| `CPP_HOOKS_CLANG_FORMAT=0` | Disable `clang-format`. |
| `CPP_HOOKS_CLANG_TIDY=0` | Disable `clang-tidy`. |
| `CPP_HOOKS_TIDY_HEADERS=1` | Include headers in `clang-tidy`. |
| `CPP_HOOKS_CTEST=0` | Disable Stop-hook CMake build and `ctest`. |
| `CPP_HOOKS_FAST=1` | Disable `clang-tidy` and Stop-hook CMake/CTest while keeping formatting. |

Supported Rust hook flags:

| Variable | Effect |
|----------|--------|
| `RUST_HOOKS_CARGO_FMT=0` | Disable Cargo-project `cargo fmt`. |
| `RUST_HOOKS_RUSTFMT=0` | Disable standalone-file `rustfmt`. |
| `RUST_HOOKS_CARGO_CHECK=0` | Disable `cargo check`. |
| `RUST_HOOKS_CARGO_CLIPPY=0` | Disable `cargo clippy -- -D warnings`. |
| `RUST_HOOKS_CARGO_TEST=0` | Disable `cargo test`. |
| `RUST_HOOKS_FAST=1` | Disable Rust Stop-hook Cargo checks while keeping formatting. |
| `RUST_HOOKS_OUTPUT_MAX_CHARS=<n>` | Limit failed command details to the last `<n>` characters; defaults to 4000 when unset or invalid. |

Rust command failure details prefer process errors, then labeled `stderr`/`stdout` output when both streams are present, then the available output stream, and finally `exit <STATUS>` when no output exists. Oversized output is reported with a trim marker before the retained tail.

Supported Python hook flags:

| Variable | Effect |
|----------|--------|
| `PYTHON_HOOKS_FORMAT=0` | Disable Python post-edit formatting. |
| `PYTHON_HOOKS_TYPECHECK=0` | Disable Python Stop-hook type checking. |
| `PYTHON_HOOKS_LINT=0` | Disable Python Stop-hook linting. |
| `PYTHON_HOOKS_TEST=0` | Disable Python Stop-hook test execution. |
| `PYTHON_HOOKS_FAST=1` | Disable Python Stop-hook typecheck/lint/test checks while keeping formatting. |
| `PYTHON_HOOKS_OUTPUT_MAX_CHARS=<n>` | Limit failed command details to the last `<n>` characters; defaults to 4000 when unset or invalid. |

Python command failure details follow the same process-error, labeled stream output, single-stream output, and exit-status fallback shape as Rust. In retry-mode Stop hooks, multiple Python failures are joined into one `systemMessage`.

## Rate Limiting

N/A — no network API is exposed.

## Pagination

N/A — no collection API is exposed.
