---
sources:
  - "README.md"
  - ".github/workflows/*.yml"
  - "plugins/**/*.mjs"
  - "plugins/**/*.json"
  - "templates/**/*.mjs"
  - "templates/**/*.json"
  - "tests/**/*.mjs"
---

# Progress & Roadmap

## Current Phase

Cross-tool plugin source with C++, Rust, Python, and JavaScript/TypeScript hook extraction, split regression coverage, and emitted install/runtime artifacts for Codex, Claude Code, and OpenCode.

## Completed

- [x] Created base repository structure with plugin marketplace, language template, and generator script.
- [x] Implemented C++, Rust, Python, and JavaScript/TypeScript hook runtimes with SQLite-backed turn state and split regression coverage.
- [x] Added `.claude-plugin/marketplace.json` plus per-plugin `.claude-plugin/plugin.json` manifests for Claude Code.
- [x] Added per-plugin `opencode/plugin.mjs` adapter modules and a shared `scripts/common/opencode_adapter.mjs` bridge that reuses the existing hook scripts.
- [x] Extended `create_language_hook_plugin.py` to update Codex and Claude marketplace catalogs, emit both manifest types, and refresh existing plugin directories idempotently.
- [x] Added cross-tool regression coverage for generator idempotency and OpenCode idle/post-edit adapter behavior.
- [x] Updated GitHub Actions smoke coverage so the temp-repo path validates Codex, Claude Code, and OpenCode artifacts together.

## In Progress

- [ ] Tighten the OpenCode installation story beyond local adapter modules if npm packaging becomes a requirement.

## Known Issues & Technical Debt

- No repository-level formatter or lint configuration is present.
- `scripts/__pycache__/` exists in the worktree and is generated Python cache output.
- OpenCode support is intentionally best-effort: failures are surfaced through plugin logs/warnings instead of fully reproducing Claude-style blocking Stop semantics.

## Roadmap

- [ ] Add more language hook plugins using the template generator.
- [ ] Decide whether OpenCode should stay file-based only or gain a first-class npm packaging path.
- [x] Added documentation and validation for cross-tool marketplace entry consistency.
