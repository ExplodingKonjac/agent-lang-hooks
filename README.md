# Agent Language Hooks

Agent Language Hooks is a cross-tool plugin source for language-specific development hooks. The repo emits install/runtime artifacts for Codex, Claude Code, and OpenCode while keeping one shared set of hook scripts per language plugin.

The Codex marketplace manifest lives at `.agents/plugins/marketplace.json`, the Claude Code marketplace manifest lives at `.claude-plugin/marketplace.json`, plugin sources live under `plugins/`, and reusable scaffolding lives under `templates/`.

## Installation

Clone this repository first and keep the checkout in place. Codex and Claude Code can consume the checkout as a marketplace source; OpenCode uses generated local proxy files that point back to this checkout.

### Codex

Add this repository as a Codex marketplace. Codex reads the marketplace catalog from `.agents/plugins/marketplace.json`, and each installable plugin has its own manifest at `plugins/<name>/.codex-plugin/plugin.json`.

After adding the marketplace, install the language plugin you want from the available marketplace entries, such as `cpp-lang-hooks`, `rust-lang-hooks`, `python-lang-hooks`, or `js-lang-hooks`.

### Claude Code

Add this repository as a Claude Code marketplace. Claude Code reads the marketplace catalog from `.claude-plugin/marketplace.json`, and each installable plugin has its own manifest at `plugins/<name>/.claude-plugin/plugin.json`.

After adding the marketplace, install the language plugin you want from the available marketplace entries, such as `cpp-lang-hooks`, `rust-lang-hooks`, `python-lang-hooks`, or `js-lang-hooks`.

### OpenCode

OpenCode does not currently consume this repository as a marketplace manifest. Instead, install repo-local proxy modules into OpenCode's plugin directory.

Install all plugins globally:

```bash
python3 scripts/install_opencode_plugin.py --scope global --plugins all
```

Install all plugins for one project:

```bash
python3 scripts/install_opencode_plugin.py --scope project --project-dir /path/to/project --plugins all
```

Install selected plugins with a comma-separated list:

```bash
python3 scripts/install_opencode_plugin.py --scope global --plugins rust-lang-hooks,python-lang-hooks
```

The installer writes small generated `.mjs` proxy files into `~/.config/opencode/plugins/` for global installs or `<project>/.opencode/plugins/` for project installs. Each proxy loads the existing `plugins/<name>/opencode/plugin.mjs` module through an absolute `file://` URL, so do not move or delete this repository checkout after installing.

## Layout

```text
.agents/plugins/marketplace.json
.claude-plugin/marketplace.json
plugins/
  <plugin>/
    .codex-plugin/plugin.json
    .claude-plugin/plugin.json
    hooks/hooks.json
    opencode/plugin.mjs
templates/
  language-hook-template/
    .codex-plugin/plugin.json
    .claude-plugin/plugin.json
    hooks/hooks.json
    opencode/plugin.mjs
scripts/
  create_language_hook_plugin.py
  install_opencode_plugin.py
```

## Add a Plugin

```bash
python3 scripts/create_language_hook_plugin.py "Python Hooks"
```

When run in a terminal, the script prompts for display name, author, category, descriptions, brand color, and starter prompts. Use `--non-interactive` to accept generated defaults.

The script copies `templates/language-hook-template`, updates plugin metadata, writes the new plugin under `plugins/`, appends it to `.agents/plugins/marketplace.json`, updates `.claude-plugin/marketplace.json`, and preserves the shared OpenCode adapter module under `opencode/plugin.mjs`. Re-running the command for an existing plugin is idempotent: manifests and marketplace entries are refreshed in place instead of duplicated.

## Runtime Surfaces

- Codex marketplace catalog: `.agents/plugins/marketplace.json`
- Claude Code marketplace catalog: `.claude-plugin/marketplace.json`
- Per-plugin Codex manifest: `plugins/<name>/.codex-plugin/plugin.json`
- Per-plugin Claude Code manifest: `plugins/<name>/.claude-plugin/plugin.json`
- Shared Codex/Claude hook runtime: `plugins/<name>/hooks/hooks.json`
- OpenCode adapter: `plugins/<name>/opencode/plugin.mjs`
- OpenCode runtime model: the adapter maps `tool.execute.after` to the existing post-edit hook scripts and `session.idle` to the existing stop hook scripts

OpenCode support is intentionally best-effort for v1. It surfaces failures through the plugin event/logging path rather than reproducing Claude-style Stop blocking exactly. Writes in one session share a pending synthetic turn until `session.idle`; duplicate idle events are ignored.

## Plugin Documents

### C++ Language Hooks

The C++ plugin formats changed C/C++ files, runs `clang-tidy` only when a matching `compile_commands.json` exists, and runs marker-specific CMake/CTest stop checks for C++ projects changed in the current turn. `CMakeCache.txt` enables builds, `CTestTestfile.cmake` enables tests, and a compile database enables tidy only. Headers are formatted by default but are not tidied unless explicitly enabled.

Environment controls:

| Variable | Effect |
|----------|--------|
| `CPP_HOOKS_CLANG_FORMAT=0` | Disable `clang-format`. |
| `CPP_HOOKS_CLANG_TIDY=0` | Disable `clang-tidy`. |
| `CPP_HOOKS_TIDY_HEADERS=1` | Run `clang-tidy` on headers as well as source files. |
| `CPP_HOOKS_CTEST=0` | Skip CMake build and `ctest` stop checks. |
| `CPP_HOOKS_FAST=1` | Disable `clang-tidy` and CMake/CTest stop checks while keeping `clang-format`. |
| `CPP_HOOKS_STATE_RETENTION_HOURS=<n>` | Delete C++ turn-state rows older than the last `<n>` hours; defaults to `24`. |
| `CPP_HOOKS_STATE_MAX_TURNS=<n>` | Keep only the newest `<n>` C++ turn-state rows as a hard cap; defaults to `1000`. |
| `CPP_HOOKS_STATE_PRUNE_INTERVAL_MINUTES=<n>` | Run C++ turn-state pruning at most once per `<n>` minutes during writes; defaults to `60`. |

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
| `RUST_HOOKS_STATE_RETENTION_HOURS=<n>` | Delete Rust turn-state rows older than the last `<n>` hours; defaults to `24`. |
| `RUST_HOOKS_STATE_MAX_TURNS=<n>` | Keep only the newest `<n>` Rust turn-state rows as a hard cap; defaults to `1000`. |
| `RUST_HOOKS_STATE_PRUNE_INTERVAL_MINUTES=<n>` | Run Rust turn-state pruning at most once per `<n>` minutes during writes; defaults to `60`. |

### Python Language Hooks

The Python plugin formats changed `.py` and `.pyi` files, records Python config-only changes for Stop-hook checks, and runs typecheck/lint/test commands only for Python project roots touched in the current turn. Markerless standalone files are formatted from their containing directory but never create Stop-check roots. Pytest requires project adoption evidence, a nearest-venv executable, and conventional test files; unittest discovery requires conventional test files and uses the nearest venv interpreter before `PATH`.

Environment controls:

| Variable | Effect |
|----------|--------|
| `PYTHON_HOOKS_FORMAT=0` | Skip Python post-edit formatting. |
| `PYTHON_HOOKS_TYPECHECK=0` | Skip Python Stop-hook type checking. |
| `PYTHON_HOOKS_LINT=0` | Skip Python Stop-hook linting. |
| `PYTHON_HOOKS_TEST=0` | Skip Python Stop-hook test execution. |
| `PYTHON_HOOKS_FAST=1` | Skip Python Stop-hook checks while keeping formatting. |
| `PYTHON_HOOKS_OUTPUT_MAX_CHARS=<n>` | Limit failure output included in Python hook messages; defaults to the last 4000 characters, with invalid values falling back to that default. |
| `PYTHON_HOOKS_STATE_RETENTION_HOURS=<n>` | Delete Python turn-state rows older than the last `<n>` hours; defaults to `24`. |
| `PYTHON_HOOKS_STATE_MAX_TURNS=<n>` | Keep only the newest `<n>` Python turn-state rows as a hard cap; defaults to `1000`. |
| `PYTHON_HOOKS_STATE_PRUNE_INTERVAL_MINUTES=<n>` | Run Python turn-state pruning at most once per `<n>` minutes during writes; defaults to `60`. |

### JavaScript/TypeScript Language Hooks

The JS/TS plugin formats changed code files, records config-only changes for Stop-hook checks, and runs typecheck/lint/test commands only for JS/TS project roots touched in the current turn, with direct-tool lint fallbacks scoped to the touched files recorded in state. The canonical npm “no test specified” placeholder is ignored; other package test scripts remain authoritative. Vitest/Jest fallbacks require adoption evidence, conventional test files, and a project-local executable. No implicit `node --test` runner is used. Missing or unreadable turn state makes every Stop hook return `{"continue":true}` without inspecting the current project.

Environment controls:

| Variable | Effect |
|----------|--------|
| `JS_HOOKS_FORMAT=0` | Skip JS/TS post-edit formatting. |
| `JS_HOOKS_TYPECHECK=0` | Skip JS/TS Stop-hook type checking. |
| `JS_HOOKS_LINT=0` | Skip JS/TS Stop-hook linting. |
| `JS_HOOKS_TEST=0` | Skip JS/TS Stop-hook test execution. |
| `JS_HOOKS_FAST=1` | Skip JS/TS Stop-hook checks while keeping formatting. |
| `JS_HOOKS_OUTPUT_MAX_CHARS=<n>` | Limit failure output included in JS/TS hook messages; defaults to the last 4000 characters, with invalid values falling back to that default. |
| `JS_HOOKS_STATE_RETENTION_HOURS=<n>` | Delete JS/TS turn-state rows older than the last `<n>` hours; defaults to `24`. |
| `JS_HOOKS_STATE_MAX_TURNS=<n>` | Keep only the newest `<n>` JS/TS turn-state rows as a hard cap; defaults to `1000`. |
| `JS_HOOKS_STATE_PRUNE_INTERVAL_MINUTES=<n>` | Run JS/TS turn-state pruning at most once per `<n>` minutes during writes; defaults to `60`. |
