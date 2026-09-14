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

# Progress & Roadmap

## Current Phase

Cross-tool plugin source with C++, Rust, Python, and JavaScript/TypeScript hook extraction, split regression coverage, `0.1.3` plugin metadata, emitted install/runtime artifacts for Codex and Claude Code, and a local proxy installer for OpenCode.

## Completed

- [x] Created base repository structure with plugin marketplace, language template, and generator script.
- [x] Implemented C++, Rust, Python, and JavaScript/TypeScript hook runtimes with SQLite-backed turn state and split regression coverage.
- [x] Added `.claude-plugin/marketplace.json` plus per-plugin `.claude-plugin/plugin.json` manifests for Claude Code.
- [x] Added per-plugin `opencode/plugin.mjs` adapter modules and a shared `scripts/common/opencode_adapter.mjs` bridge that reuses the existing hook scripts.
- [x] Extended `create_language_hook_plugin.py` to update Codex and Claude marketplace catalogs, emit both manifest types, and refresh existing plugin directories idempotently.
- [x] Added cross-tool regression coverage for generator idempotency and OpenCode idle/post-edit adapter behavior.
- [x] Updated GitHub Actions smoke coverage so the temp-repo path validates Codex, Claude Code, and OpenCode artifacts together.
- [x] Added `scripts/install_opencode_plugin.py` plus README installation guidance for Codex, Claude Code, and OpenCode local proxy installs.
- [x] Added OpenCode installer tests for plugin discovery, global/project destinations, proxy content, idempotency, and overwrite protection.
- [x] Removed `$schema` fields from plugin and template `hooks/hooks.json` files to keep hook configs compatible across supported tool surfaces.
- [x] Bumped generator defaults plus Claude/Codex plugin release metadata from `0.1.1` to `0.1.2`.
- [x] Bumped plugin metadata and generator defaults to `0.1.3` for adoption-aware Stop checks and scoped turn-state behavior.

## In Progress

- [ ] Decide whether OpenCode should also gain a first-class npm packaging path.

## Known Issues & Technical Debt

- No repository-level formatter or lint configuration is present.
- `scripts/__pycache__/` exists in the worktree and is generated Python cache output.
- OpenCode support is intentionally best-effort: failures are surfaced through plugin logs/warnings instead of fully reproducing Claude-style blocking Stop semantics.

## Roadmap

- [ ] Add more language hook plugins using the template generator.
- [ ] Decide whether OpenCode should stay file-based only or gain a first-class npm packaging path.
- [x] Added documentation and validation for cross-tool marketplace entry consistency.
- [x] Added local OpenCode proxy installation for users who cannot consume the repo as a marketplace.
- [x] Made Stop checks turn-scoped and fail-open when state is missing, with adoption-aware JS/Python test discovery and marker-specific CMake checks.
- [x] Added additive C++ project-root state tracking and pending-turn reuse for OpenCode writes.
