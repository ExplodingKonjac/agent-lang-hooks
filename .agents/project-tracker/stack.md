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
| Package manager | None declared repo-wide; JS/TS hooks detect local package managers per project |

## Frameworks & Libraries

| Dependency | Version | Purpose |
|------------|---------|---------|
| `node:fs`, `node:path`, `node:child_process` | Node built-ins | File/project inspection, path resolution, and running external language tools. |
| `node:sqlite` | Node built-in | Persists C++, Rust, Python, and JavaScript/TypeScript hook per-turn state without adding npm dependencies. |
| `node:test`, `node:assert/strict`, `node:os` | Node built-ins | Hook-level regression tests, temp fixture setup, and shared test harness utilities. |
| Python standard library | Python 3 | Template copying, JSON mutation, argument parsing, and interactive prompting. |

## Database & Storage

| Component | Technology | Purpose |
|-----------|------------|---------|
| C++ hook state DB | SQLite file at `${PLUGIN_DATA}/cpp-lang-hooks.sqlite3` | Records whether a turn changed C/C++ files so `Stop` can skip redundant `ctest` runs. |
| Rust hook state DB | SQLite file at `${PLUGIN_DATA}/rust-lang-hooks.sqlite3` | Records whether a turn changed Rust files and which Cargo projects need Stop checks. |
| Python hook state DB | SQLite file at `${PLUGIN_DATA}/python-lang-hooks.sqlite3` | Records whether a turn changed Python files/config and which Python project roots need Stop checks. |
| JavaScript/TypeScript hook state DB | SQLite file at `${PLUGIN_DATA}/js-lang-hooks.sqlite3` | Records whether a turn changed JS/TS files/config, which JS/TS project roots need Stop checks, and which existing code files were touched for lint-on-files behavior. |
| Marketplace manifest | JSON at `.agents/plugins/marketplace.json` | Lists local plugin entries and installation policy. |
| Plugin manifests | JSON under `.codex-plugin/` | Defines plugin metadata shown by Codex. |

## Infrastructure & Services

- No external infrastructure, cloud service, or network dependency is declared.
- Hook execution depends on host-installed tools when available: `node`, `clang-format`, `clang-tidy`, `cmake`, `ctest`, `cargo`, `rustfmt`, Python formatters/checkers/test runners, JavaScript/TypeScript formatters/linters/test runners/package managers, and build/project metadata for the target language.
- Tests also depend on temp directories, fake executables, and SQLite inspection helpers implemented with Node built-ins rather than external packages.
- C++ hook behavior is configurable through local `CPP_HOOKS_*` environment variables; no new runtime dependency is introduced for configuration.
- Rust hook behavior and failed-command output size are configurable through local `RUST_HOOKS_*` environment variables; no new runtime dependency is introduced for configuration.
- Python hook behavior and failed-command output size are configurable through local `PYTHON_HOOKS_*` environment variables; no new runtime dependency is introduced for configuration.
- JavaScript/TypeScript hook behavior, richer tool-config detection, package-manager-aware script invocation, discovered `package.json` parsing, JSONC-aware TS/JS config validation, and failed-command output size are configurable through local `JS_HOOKS_*` environment variables; no new runtime dependency is introduced for configuration.
