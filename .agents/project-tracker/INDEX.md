---
sources:
  - "README.md"
  - ".agents/plugins/marketplace.json"
  - "plugins/*/.codex-plugin/plugin.json"
  - "plugins/**/*.json"
  - "templates/*/.codex-plugin/plugin.json"
  - "templates/**/*.json"
---

# Codex Language Hooks

Codex Language Hooks is a repo-local Codex plugin marketplace for language-specific hook plugins, with C++ and Rust hook plugins plus a reusable language-hook template.

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
| Hook runtime | Node.js ES modules | Node 24.x locally; plugin relies on `node:sqlite` |
| Scaffolding | Python | Python 3.x |
| Plugin format | Codex plugin manifests and hook JSON | Marketplace-local |
| Persistence | SQLite via `node:sqlite` | Built into Node |
| CI/CD | N/A | No workflow files present |

- Hook implementations are plain `.mjs` scripts invoked from plugin hook configuration.
- Plugin metadata is stored in `.codex-plugin/plugin.json`; hook wiring is stored in `hooks/hooks.json`.
- `scripts/create_language_hook_plugin.py` copies the template plugin and updates metadata plus marketplace entries.
- C++ hook state is stored under `PLUGIN_DATA` to avoid redundant `ctest` runs.
- C++ hook checks can be tuned with `CPP_HOOKS_*` environment flags, including a fast mode that keeps formatting while skipping heavier tidy/test checks.
- Rust hook state is stored under `PLUGIN_DATA` to run Cargo stop checks only for affected Cargo projects.
- Rust hook checks can be tuned with `RUST_HOOKS_*` environment flags, including standalone-file `rustfmt` support for `.rs` files outside Cargo projects.
- Rust hook failure messages use shared command-output formatting and trim long tool output with `RUST_HOOKS_OUTPUT_MAX_CHARS`, defaulting to the last 4000 characters.

## Quick Reference Commands

```bash
# Create a plugin from the template
python3 scripts/create_language_hook_plugin.py "Python Hooks"

# Create a plugin with generated defaults
python3 scripts/create_language_hook_plugin.py "Python Hooks" --non-interactive

# Run the C++ hook state tests
node --test tests/cpp-lang-hooks/stateful_hooks.test.mjs

# Run the Rust hook state tests
node --test tests/rust-lang-hooks/stateful_hooks.test.mjs

# Syntax-check hook scripts
node --check plugins/cpp-lang-hooks/scripts/post_edit_hook.mjs
node --check plugins/cpp-lang-hooks/scripts/stop_hook.mjs
node --check plugins/cpp-lang-hooks/scripts/common/hook.mjs
node --check plugins/cpp-lang-hooks/scripts/common/turn_state.mjs
node --check plugins/rust-lang-hooks/scripts/post_edit_hook.mjs
node --check plugins/rust-lang-hooks/scripts/stop_hook.mjs
node --check plugins/rust-lang-hooks/scripts/common/hook.mjs
node --check plugins/rust-lang-hooks/scripts/common/turn_state.mjs
```

## Project Map

- `.agents/plugins/marketplace.json` — repo-local plugin marketplace manifest.
- `plugins/cpp-lang-hooks/` — C++ language hook plugin.
- `plugins/rust-lang-hooks/` — Rust language hook plugin.
- `templates/language-hook-template/` — template copied when creating new language plugins.
- `scripts/create_language_hook_plugin.py` — plugin scaffolding CLI.
- `tests/cpp-lang-hooks/` — Node hook-level regression tests.
- `tests/rust-lang-hooks/` — Node hook-level regression tests.

## Tracking Exclusions

- `scripts/__pycache__/` — generated Python bytecode cache.
- `.git/` — VCS internals, not project behavior.
