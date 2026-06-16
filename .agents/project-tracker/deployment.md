---
sources:
  - "README.md"
  - ".github/workflows/*.yml"
  - ".agents/plugins/marketplace.json"
  - ".claude-plugin/marketplace.json"
  - "plugins/**/*.json"
  - "plugins/**/*.mjs"
  - "templates/**/*.json"
---

# Deployment

## Build Artifacts

| Artifact | Format | How to build |
|----------|--------|--------------|
| Language hook plugin | Directory containing `.codex-plugin/`, `.claude-plugin/`, `hooks/`, `opencode/`, and `scripts/` | Copy the template with `python3 scripts/create_language_hook_plugin.py "<NAME>"` or edit plugin sources directly. |
| Codex marketplace manifest | JSON | Updated by `scripts/create_language_hook_plugin.py`. |
| Claude marketplace manifest | JSON | Updated by `scripts/create_language_hook_plugin.py`. |

## Packaging

Plugins are stored as local source directories under `plugins/` and referenced by `.agents/plugins/marketplace.json` for Codex and `.claude-plugin/marketplace.json` for Claude Code. OpenCode is shipped as per-plugin adapter modules under `plugins/*/opencode/plugin.mjs`. There is no package archive, Docker image, or published registry artifact in the current repository.

GitHub Actions CI in `.github/workflows/ci.yml` verifies repository health on `push` and `pull_request`, but it does not publish artifacts or deploy to any remote environment.

## Environments

| Environment | URL / target | Promotion from | Notes |
|-------------|--------------|----------------|-------|
| Local workspace | Repository checkout | N/A | Primary development and installation context. |

## Health Checks

| Check | Endpoint / command | Expected |
|-------|--------------------|----------|
| Hook syntax | `node --check plugins/python-lang-hooks/scripts/post_edit_hook.mjs` | Exit 0 |
| Hook syntax | `node --check plugins/python-lang-hooks/scripts/stop_hook.mjs` | Exit 0 |
| OpenCode adapter syntax | `node --check plugins/python-lang-hooks/opencode/plugin.mjs` | Exit 0 |
| OpenCode adapter syntax | `node --check plugins/python-lang-hooks/scripts/common/opencode_adapter.mjs` | Exit 0 |
| Full hook regression suite | `node --test tests/all.test.mjs` | All tests pass |
| Generator smoke | `python3 scripts/create_language_hook_plugin.py "CI Smoke Hooks" --non-interactive` in a temp repo copy | Emits Codex manifest, Claude manifest, OpenCode adapter, and both marketplace entries |

## Monitoring & Alerts

N/A for hosted deployment. Hook runtime errors are written to `${PLUGIN_DATA}/hook_errors.log` when available. OpenCode adapter warnings are surfaced through plugin logging and console warnings.

## Rollback Procedure

N/A for hosted deployment. For local plugin changes, revert the relevant plugin directory plus `.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json` changes in version control.
