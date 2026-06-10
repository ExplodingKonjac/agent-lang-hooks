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
| C++ hook environment flags | `CPP_HOOKS_*` environment variables | Selected local checks are enabled or skipped | Controls format, tidy, header tidy, Stop-hook CTest, and fast mode behavior. |
| Rust hook environment flags | `RUST_HOOKS_*` environment variables | Selected local checks are enabled or skipped | Controls Cargo formatting, standalone `rustfmt`, Cargo Stop checks, and fast mode behavior. |

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
| `RUST_HOOKS_CARGO_CLIPPY=0` | Disable `cargo clippy`. |
| `RUST_HOOKS_CARGO_TEST=0` | Disable `cargo test`. |
| `RUST_HOOKS_FAST=1` | Disable Rust Stop-hook Cargo checks while keeping formatting. |

## Rate Limiting

N/A — no network API is exposed.

## Pagination

N/A — no collection API is exposed.
