---
sources:
  - "README.md"
  - ".github/workflows/*.yml"
  - ".agents/plugins/marketplace.json"
  - "plugins/*/.codex-plugin/plugin.json"
  - "plugins/**/*.json"
  - "templates/*/.codex-plugin/plugin.json"
  - "templates/**/*.json"
---

# Codex Language Hooks

Codex Language Hooks is a repo-local Codex plugin marketplace for language-specific hook plugins, with C++, Rust, Python, and JavaScript/TypeScript hook plugins plus a reusable language-hook template.

## Table of Contents

- [Stack](stack.md) — Technology choices and dependencies
- [Toolchain](toolchain.md) — Build, test, CI/CD, dev setup
- [Architecture](architecture.md) — Module layout and data flow
- [Conventions](conventions.md) — Coding standards, naming rules, architectural rules
- [Progress](progress.md) — Current status and roadmap
- [Implementation](implementation.md) — Key implementation details
- [Data Model](data-model.md) — Hook state and persistence
- [API](api.md) — Network API applicability
- [Deployment](deployment.md) — Plugin packaging and distribution notes

## Tech Stack Summary

| Layer | Technology | Version |
|-------|------------|---------|
| Hook runtime | Node.js ES modules | Node 24.x locally; stateful plugins rely on `node:sqlite` |
| Scaffolding | Python | Python 3.x |
| Plugin format | Codex plugin manifests and hook JSON | Marketplace-local |
| Persistence | SQLite via `node:sqlite` | Built into Node |
| CI/CD | GitHub Actions | `.github/workflows/ci.yml` runs syntax checks, the full Node suite, and a Python generator smoke test |

- Hook implementations are plain `.mjs` scripts invoked from plugin hook configuration.
- Plugin metadata is stored in `.codex-plugin/plugin.json`; hook wiring is stored in `hooks/hooks.json`.
- `scripts/create_language_hook_plugin.py` copies the template plugin and updates metadata plus marketplace entries.
- `.github/workflows/ci.yml` runs Node syntax checks across repo `.mjs` files, the full `tests/all.test.mjs` suite, and an isolated plugin-generator smoke test on GitHub Actions.
- C++ hook state is stored under `PLUGIN_DATA` to avoid redundant `ctest` runs.
- C++ hook checks can be tuned with `CPP_HOOKS_*` environment flags, including a fast mode that keeps formatting while skipping heavier tidy/test checks, plus hybrid state-retention controls that prune old SQLite rows by age and row cap.
- Rust hook state is stored under `PLUGIN_DATA` to run Cargo stop checks only for affected Cargo projects.
- Rust hook checks can be tuned with `RUST_HOOKS_*` environment flags, including standalone-file `rustfmt` support for `.rs` files outside Cargo projects and hybrid state-retention controls for the SQLite turn-state DB.
- Rust hook failure messages use shared command-output formatting and trim long tool output with `RUST_HOOKS_OUTPUT_MAX_CHARS`, defaulting to the last 4000 characters.
- Python hook state is stored under `PLUGIN_DATA` to run Stop checks only for affected Python project roots.
- Python post-edit checks format existing `.py`/`.pyi` files with the first available formatter family: `ruff`, `black` plus optional `isort`, then `yapf`.
- Python Stop checks run the first available type checker, linter, and test runner from configured candidate lists, preferring nearest virtualenv tools before global `PATH` tools.
- Python hook checks can be tuned with `PYTHON_HOOKS_*` environment flags, including fast mode, bounded failure output through `PYTHON_HOOKS_OUTPUT_MAX_CHARS`, and hybrid state-retention controls for the SQLite turn-state DB.
- JavaScript/TypeScript hook state is stored under `PLUGIN_DATA` to run Stop checks only for affected JS/TS project roots.
- JavaScript/TypeScript post-edit checks format existing code files with `prettier --write`, falling back to `biome format --write`.
- JavaScript/TypeScript Stop checks prefer package scripts for `typecheck`, `lint`, and `test`, then fall back to `tsc --noEmit`, `eslint` / `biome check`, and `vitest` / `jest` / `node --test`.
- JavaScript/TypeScript hooks prefer executables from the nearest `node_modules/.bin` before global `PATH`, detect package managers from `package.json` or lockfiles, trim failed output through `JS_HOOKS_OUTPUT_MAX_CHARS`, and prune old turn-state rows with hybrid retention controls.

## Quick Reference Commands

```bash
# Create a plugin from the template
python3 scripts/create_language_hook_plugin.py "Python Hooks"

# Create a plugin with generated defaults
python3 scripts/create_language_hook_plugin.py "Python Hooks" --non-interactive

# Run the C++ hook state tests
node --test tests/all.test.mjs

# Run the Rust hook state tests
node --test tests/rust-lang-hooks/all.test.mjs

# Run the Python hook state tests
node --test tests/python-lang-hooks/all.test.mjs

# Run the JavaScript/TypeScript hook state tests
node --test tests/js-lang-hooks/all.test.mjs

# Run the full hook regression suite
node --test tests/all.test.mjs

# Syntax-check hook scripts
node --check plugins/cpp-lang-hooks/scripts/post_edit_hook.mjs
node --check plugins/cpp-lang-hooks/scripts/stop_hook.mjs
node --check plugins/cpp-lang-hooks/scripts/common/hook.mjs
node --check plugins/cpp-lang-hooks/scripts/common/turn_state.mjs
node --check plugins/rust-lang-hooks/scripts/post_edit_hook.mjs
node --check plugins/rust-lang-hooks/scripts/stop_hook.mjs
node --check plugins/rust-lang-hooks/scripts/common/hook.mjs
node --check plugins/rust-lang-hooks/scripts/common/turn_state.mjs
node --check plugins/python-lang-hooks/scripts/post_edit_hook.mjs
node --check plugins/python-lang-hooks/scripts/stop_hook.mjs
node --check plugins/python-lang-hooks/scripts/common/hook.mjs
node --check plugins/python-lang-hooks/scripts/common/turn_state.mjs
node --check plugins/js-lang-hooks/scripts/post_edit_hook.mjs
node --check plugins/js-lang-hooks/scripts/stop_hook.mjs
node --check plugins/js-lang-hooks/scripts/common/hook.mjs
node --check plugins/js-lang-hooks/scripts/common/node_runtime.mjs
node --check plugins/js-lang-hooks/scripts/common/turn_state.mjs
```

## Project Map

- `.agents/plugins/marketplace.json` — repo-local plugin marketplace manifest.
- `.github/workflows/ci.yml` — GitHub Actions workflow for syntax checks, full tests, and generator smoke verification.
- `plugins/cpp-lang-hooks/` — C++ language hook plugin.
- `plugins/rust-lang-hooks/` — Rust language hook plugin.
- `plugins/python-lang-hooks/` — Python language hook plugin.
- `plugins/js-lang-hooks/` — JavaScript/TypeScript language hook plugin.
- `templates/language-hook-template/` — template copied when creating new language plugins.
- `scripts/create_language_hook_plugin.py` — plugin scaffolding CLI.
- `tests/cpp-lang-hooks/` — Node hook-level regression tests.
- `tests/rust-lang-hooks/` — Node hook-level regression tests.
- `tests/python-lang-hooks/` — Node hook-level regression tests.
- `tests/js-lang-hooks/` — Node hook-level regression tests.

## Tracking Exclusions

- `scripts/__pycache__/` — generated Python bytecode cache.
- `.git/` — VCS internals, not project behavior.
