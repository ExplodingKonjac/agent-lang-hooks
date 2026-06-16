---
sources:
  - "README.md"
  - ".github/workflows/*.yml"
  - ".agents/plugins/marketplace.json"
  - ".claude-plugin/marketplace.json"
  - "plugins/*/.codex-plugin/plugin.json"
  - "plugins/*/.claude-plugin/plugin.json"
  - "plugins/**/opencode/*.mjs"
  - "templates/*/.codex-plugin/plugin.json"
  - "templates/*/.claude-plugin/plugin.json"
  - "templates/**/*.json"
---

# Agent Language Hooks

Agent Language Hooks is a cross-tool plugin source for language-specific development hooks. The repo ships C++, Rust, Python, and JavaScript/TypeScript plugins plus a reusable template that emits Codex, Claude Code, and OpenCode artifacts from one scaffold path.

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
| Plugin format | Codex manifests, Claude marketplace/manifests, OpenCode plugin modules | Repo-local |
| Persistence | SQLite via `node:sqlite` | Built into Node |
| CI/CD | GitHub Actions | `.github/workflows/ci.yml` runs syntax checks, the full Node suite, and a generator smoke test |

- Codex metadata is stored in `.codex-plugin/plugin.json`; Claude metadata is stored in `.claude-plugin/plugin.json`; Codex and Claude share `hooks/hooks.json`.
- OpenCode adapters live in `opencode/plugin.mjs` and reuse the existing hook scripts through `scripts/common/opencode_adapter.mjs`.
- `scripts/create_language_hook_plugin.py` copies the template plugin and updates both marketplace catalogs plus both manifest types.
- `.github/workflows/ci.yml` runs Node syntax checks across repo `.mjs` files, the full `tests/all.test.mjs` suite, and a temp-repo smoke test that asserts Codex, Claude Code, and OpenCode artifacts together.

## Quick Reference Commands

```bash
# Create or refresh a plugin from the template
python3 scripts/create_language_hook_plugin.py "Python Hooks"

# Create with generated defaults
python3 scripts/create_language_hook_plugin.py "Python Hooks" --non-interactive

# Run the full regression suite
node --test tests/all.test.mjs

# Run the cross-tool packaging/adapter tests only
node --test tests/cross_tool_marketplace.test.mjs

# Syntax-check all repo modules in CI style
find plugins tests templates -name '*.mjs' -print | sort | xargs -n 1 node --check
```

## Project Map

- `.agents/plugins/marketplace.json` — Codex marketplace manifest.
- `.claude-plugin/marketplace.json` — Claude Code marketplace manifest.
- `.github/workflows/ci.yml` — GitHub Actions workflow for syntax checks, full tests, and generator smoke verification.
- `plugins/cpp-lang-hooks/` — C++ language hook plugin with Codex/Claude manifests and OpenCode adapter.
- `plugins/rust-lang-hooks/` — Rust language hook plugin with Codex/Claude manifests and OpenCode adapter.
- `plugins/python-lang-hooks/` — Python language hook plugin with Codex/Claude manifests and OpenCode adapter.
- `plugins/js-lang-hooks/` — JavaScript/TypeScript language hook plugin with Codex/Claude manifests and OpenCode adapter.
- `templates/language-hook-template/` — template copied when creating new language plugins.
- `scripts/create_language_hook_plugin.py` — cross-tool plugin scaffolding CLI.
- `tests/cross_tool_marketplace.test.mjs` — generator idempotency and OpenCode adapter coverage.

## Tracking Exclusions

- `scripts/__pycache__/` — generated Python bytecode cache.
- `.git/` — VCS internals, not project behavior.
