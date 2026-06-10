# Codex Language Hooks

Codex Language Hooks is a repo-local Codex plugin marketplace for language-specific hook plugins.

The marketplace manifest lives at `.agents/plugins/marketplace.json`, plugin sources live under `plugins/`, and reusable scaffolding lives under `templates/`.

## Layout

```text
.agents/plugins/marketplace.json
plugins/
templates/
  language-hook-template/
    .codex-plugin/plugin.json
    hooks/hooks.json
scripts/
  create_language_hook_plugin.py
```

## Add a Plugin

```bash
python3 scripts/create_language_hook_plugin.py "Python Hooks"
```

When run in a terminal, the script prompts for display name, author, category, descriptions, brand color, and starter prompts. Use `--non-interactive` to accept generated defaults.

The script copies `templates/language-hook-template`, updates plugin metadata, writes the new plugin under `plugins/`, and appends it to `.agents/plugins/marketplace.json`.

## Plugin Documents

### C++ Language Hooks

The C++ plugin formats changed C/C++ files, runs `clang-tidy` on changed source files, and runs CMake/CTest stop checks when the current turn changed C/C++ files. Headers are formatted by default but are not tidied unless explicitly enabled.

Environment controls:

| Variable | Effect |
|----------|--------|
| `CPP_HOOKS_CLANG_FORMAT=0` | Disable `clang-format`. |
| `CPP_HOOKS_CLANG_TIDY=0` | Disable `clang-tidy`. |
| `CPP_HOOKS_TIDY_HEADERS=1` | Run `clang-tidy` on headers as well as source files. |
| `CPP_HOOKS_CTEST=0` | Skip CMake build and `ctest` stop checks. |
| `CPP_HOOKS_FAST=1` | Disable `clang-tidy` and CMake/CTest stop checks while keeping `clang-format`. |

### Rust Language Hooks

The Rust plugin formats changed `.rs` files and runs Cargo stop checks when the current turn changed Rust files in a Cargo project. Cargo projects are detected by the nearest ancestor `Cargo.toml`; Cargo commands run from that directory so Cargo can discover the manifest normally. Standalone `.rs` files without a Cargo project are formatted with `rustfmt` and do not trigger `cargo check`, `cargo clippy`, or `cargo test`.

Environment controls:

| Variable | Effect |
|----------|--------|
| `RUST_HOOKS_CARGO_FMT=0` | Skip Cargo-project `cargo fmt`. |
| `RUST_HOOKS_RUSTFMT=0` | Skip standalone-file `rustfmt`. |
| `RUST_HOOKS_CARGO_CHECK=0` | Skip `cargo check` stop checks. |
| `RUST_HOOKS_CARGO_CLIPPY=0` | Skip `cargo clippy` stop checks. |
| `RUST_HOOKS_CARGO_TEST=0` | Skip `cargo test` stop checks. |
| `RUST_HOOKS_FAST=1` | Skip all Rust stop checks while keeping formatting. |
| `RUST_HOOKS_OUTPUT_MAX_CHARS=<n>` | Limit failure output included in Rust hook messages; defaults to the last 4000 characters, with invalid values falling back to that default. |
