---
sources:
  - "README.md"
  - ".github/workflows/*.yml"
  - "scripts/*.py"
  - "plugins/**/*.mjs"
  - "plugins/**/*.json"
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
| `node:fs`, `node:path`, `node:child_process`, `node:url`, `node:crypto`, `node:os` | Node built-ins | File/project inspection, path resolution, compatibility adapters, external tool execution, and temporary state locations. |
| `node:sqlite` | Node built-in | Persists C++, Rust, Python, and JavaScript/TypeScript hook per-turn state without npm dependencies. |
| `node:test`, `node:assert/strict` | Node built-ins | Hook-level regression tests and adapter verification. |
| Python standard library | Python 3 | Template copying, JSON mutation, argument parsing, and interactive prompting. |

## Database & Storage

| Component | Technology | Purpose |
|-----------|------------|---------|
| C++ hook state DB | SQLite file at `${PLUGIN_DATA}/cpp-lang-hooks.sqlite3` | Records whether a turn changed C/C++ files so `Stop` can skip redundant `ctest` runs. |
| Rust hook state DB | SQLite file at `${PLUGIN_DATA}/rust-lang-hooks.sqlite3` | Records whether a turn changed Rust files and which Cargo projects need Stop checks. |
| Python hook state DB | SQLite file at `${PLUGIN_DATA}/python-lang-hooks.sqlite3` | Records whether a turn changed Python files/config and which Python project roots need Stop checks. |
| JavaScript/TypeScript hook state DB | SQLite file at `${PLUGIN_DATA}/js-lang-hooks.sqlite3` | Records whether a turn changed JS/TS files/config, which project roots need Stop checks, and which files were touched for file-scoped lint. |
| Codex marketplace manifest | JSON at `.agents/plugins/marketplace.json` | Lists local plugin entries and installation policy for Codex. |
| Claude marketplace manifest | JSON at `.claude-plugin/marketplace.json` | Lists local plugin entries and metadata for Claude Code discovery/install. |
| Plugin manifests | JSON under `.codex-plugin/` and `.claude-plugin/` | Defines plugin metadata for Codex and Claude Code. |

## Infrastructure & Services

- No external infrastructure, cloud service, or network dependency is declared.
- Hook execution depends on host-installed tools when available: `node`, `clang-format`, `clang-tidy`, `cmake`, `ctest`, `cargo`, `rustfmt`, Python formatters/checkers/test runners, JavaScript/TypeScript formatters/linters/test runners/package managers, and build/project metadata for the target language.
- OpenCode adapters reuse the existing Node hook scripts by synthesizing stdin payloads and supplying a temporary `PLUGIN_DATA` directory when one is not already configured.
- Tests depend on temp directories, fake executables, and SQLite inspection helpers implemented with Node built-ins rather than external packages.
