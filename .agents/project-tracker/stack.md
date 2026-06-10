---
sources:
  - "README.md"
  - "scripts/*.py"
  - "plugins/*/.codex-plugin/plugin.json"
  - "plugins/**/*.mjs"
  - "plugins/**/*.json"
  - "templates/*/.codex-plugin/plugin.json"
  - "templates/**/*.mjs"
  - "templates/**/*.json"
  - "tests/**/*.mjs"
---

# Technology Stack

## Language & Runtime

| Property | Value |
|----------|-------|
| Hook language | JavaScript ES modules (`.mjs`) |
| Hook runtime | Node.js; current local runtime is Node 24.16.0 |
| Scaffolding language | Python 3 |
| Package manager | None declared |

## Frameworks & Libraries

| Dependency | Version | Purpose |
|------------|---------|---------|
| `node:fs`, `node:path`, `node:child_process` | Node built-ins | File/project inspection, path resolution, and running external language tools. |
| `node:sqlite` | Node built-in | Persists C++ and Rust hook per-turn state without adding npm dependencies. |
| `node:test`, `node:assert/strict` | Node built-ins | Hook-level regression tests. |
| Python standard library | Python 3 | Template copying, JSON mutation, argument parsing, and interactive prompting. |

## Database & Storage

| Component | Technology | Purpose |
|-----------|------------|---------|
| C++ hook state DB | SQLite file at `${PLUGIN_DATA}/cpp-lang-hooks.sqlite3` | Records whether a turn changed C/C++ files so `Stop` can skip redundant `ctest` runs. |
| Rust hook state DB | SQLite file at `${PLUGIN_DATA}/rust-lang-hooks.sqlite3` | Records whether a turn changed Rust files and which Cargo projects need Stop checks. |
| Marketplace manifest | JSON at `.agents/plugins/marketplace.json` | Lists local plugin entries and installation policy. |
| Plugin manifests | JSON under `.codex-plugin/` | Defines plugin metadata shown by Codex. |

## Infrastructure & Services

- No external infrastructure, cloud service, or network dependency is declared.
- Hook execution depends on host-installed tools when available: `node`, `clang-format`, `clang-tidy`, `cmake`, `ctest`, `cargo`, `rustfmt`, and build/project metadata for the target language.
- C++ hook behavior is configurable through local `CPP_HOOKS_*` environment variables; no new runtime dependency is introduced for configuration.
- Rust hook behavior is configurable through local `RUST_HOOKS_*` environment variables; no new runtime dependency is introduced for configuration.
