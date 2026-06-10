---
sources:
  - "README.md"
  - ".agents/plugins/marketplace.json"
  - "plugins/**/*.json"
  - "templates/**/*.json"
---

# Deployment

## Build Artifacts

| Artifact | Format | How to build |
|----------|--------|--------------|
| Language hook plugin | Directory containing `.codex-plugin/`, `hooks/`, and `scripts/` | Copy the template with `python3 scripts/create_language_hook_plugin.py "<NAME>"` or edit plugin sources directly. |
| Marketplace manifest | JSON | Updated by `scripts/create_language_hook_plugin.py`. |

## Packaging

Plugins are stored as local source directories under `plugins/` and referenced by `.agents/plugins/marketplace.json`. There is no package archive, Docker image, or published registry artifact in the current repository.

## Environments

| Environment | URL / target | Promotion from | Notes |
|-------------|--------------|----------------|-------|
| Local workspace | Repository checkout | N/A | Primary development and installation context. |

## Health Checks

| Check | Endpoint / command | Expected |
|-------|--------------------|----------|
| Hook syntax | `node --check plugins/cpp-lang-hooks/scripts/post_edit_hook.mjs` | Exit 0 |
| Hook syntax | `node --check plugins/cpp-lang-hooks/scripts/stop_hook.mjs` | Exit 0 |
| Hook syntax | `node --check plugins/cpp-lang-hooks/scripts/common/hook.mjs` | Exit 0 |
| Hook syntax | `node --check plugins/rust-lang-hooks/scripts/post_edit_hook.mjs` | Exit 0 |
| Hook syntax | `node --check plugins/rust-lang-hooks/scripts/stop_hook.mjs` | Exit 0 |
| Hook syntax | `node --check plugins/rust-lang-hooks/scripts/common/hook.mjs` | Exit 0 |
| C++ hook tests | `node --test tests/cpp-lang-hooks/stateful_hooks.test.mjs` | All tests pass |
| Rust hook tests | `node --test tests/rust-lang-hooks/stateful_hooks.test.mjs` | All tests pass |

## Monitoring & Alerts

N/A — no deployed service or runtime monitoring exists. Hook runtime errors are written to `${PLUGIN_DATA}/hook_errors.log` when available, local `CPP_HOOKS_*` / `RUST_HOOKS_*` flags can reduce hook work in latency-sensitive environments, and `RUST_HOOKS_OUTPUT_MAX_CHARS` bounds failed Rust tool output included in hook messages.

## Rollback Procedure

N/A for hosted deployment. For local plugin changes, revert the relevant plugin directory and marketplace manifest changes in version control.
