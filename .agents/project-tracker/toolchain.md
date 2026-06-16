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

# Toolchain & Dev Setup

## Build System

| Tool | Command | Output |
|------|---------|--------|
| Python script | `python3 scripts/create_language_hook_plugin.py "<NAME>"` | New plugin directory under `plugins/` plus Codex marketplace entry, Claude marketplace entry, and OpenCode adapter module. |
| Node.js | `node <HOOK_SCRIPT>` | Hook JSON response on stdout. |

There is no compile or bundle step for the repository itself.

## Linting & Formatting

| Tool | Config file | Run command |
|------|-------------|-------------|
| Node syntax checker | N/A | `node --check <FILE>.mjs` |
| Python bytecode check | N/A | `python3 -m py_compile scripts/create_language_hook_plugin.py` |
| Language-specific host tools | Project-local configs if present | Invoked automatically by the language hooks when enabled. |

## Testing

| Aspect | Detail |
|--------|--------|
| Framework | Node built-in test runner |
| Main commands | `node --test tests/all.test.mjs`; focused suites can also target `tests/cross_tool_marketplace.test.mjs` and the existing per-language suites under `tests/*-lang-hooks/` |
| Integration style | Tests spawn hook scripts with JSON stdin, temp language-project fixtures, fake host tools, temp `PLUGIN_DATA`, and shared harness helpers from `tests/shared/`. |

## CI/CD Pipeline

| Surface | Detail |
|---------|--------|
| Provider | GitHub Actions |
| Workflow | `.github/workflows/ci.yml` |
| Triggers | `push`, `pull_request` |
| Checks | `node --check` across repo `.mjs` files, `python3 -m py_compile scripts/create_language_hook_plugin.py`, `node --test tests/all.test.mjs`, and an isolated `create_language_hook_plugin.py --non-interactive` smoke test in a temp repo copy that validates Codex, Claude Code, and OpenCode artifacts |

## Development Environment

| Requirement | Value |
|-------------|-------|
| Node.js | Required for hook scripts and tests; Node 24.x is used locally because the state helpers import `node:sqlite`. |
| Python | Required for `scripts/create_language_hook_plugin.py`. |
| Optional C++ tools | `clang-format`, `clang-tidy`, `cmake`, `ctest` |
| Optional Rust tools | `cargo`, `rustfmt` |
| Optional Python tools | `ruff`, `black`, `isort`, `yapf`, `ty`, `pyre`, `pyright`, `mypy`, `pylint`, `pytest` |
| Optional JS/TS tools | `prettier`, `biome`, `eslint`, `tsc`, `vitest`, `jest`, `node`, `npm`, `pnpm`, `yarn`, `bun` |
| Environment variables | `PLUGIN_ROOT` is used by hook config; `PLUGIN_DATA` stores hook errors and SQLite state; `CPP_HOOKS_*`, `RUST_HOOKS_*`, `PYTHON_HOOKS_*`, `JS_HOOKS_*`, and `CODEX_LANG_HOOKS_NODE_PATH` control runtime behavior |
