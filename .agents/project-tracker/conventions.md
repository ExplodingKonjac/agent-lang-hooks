---
sources:
  - "README.md"
  - "scripts/*.py"
  - "plugins/**/*.mjs"
  - "plugins/**/*.json"
  - "templates/**/*.mjs"
  - "templates/**/*.json"
  - "tests/**/*.mjs"
---

# Project Conventions

> Agents MUST read and follow these conventions.

## Coding Conventions

| Aspect | Rule | Config |
|--------|------|--------|
| JavaScript modules | Use ES module imports in `.mjs` files. | Existing hook scripts |
| JavaScript style | Two-space indentation, double quotes, semicolons, trailing commas in multiline calls/arrays. | Existing hook scripts/tests |
| Python style | Type hints, dataclass for structured metadata, standard-library-only implementation. | `scripts/create_language_hook_plugin.py` |
| JSON style | Two-space indentation and trailing newline when written by scripts. | `write_json()` |
| Formatter config | Not specified. | N/A |

## Naming Conventions

| Category | Convention | Example |
|----------|------------|---------|
| Plugin directories | Kebab-case. | `cpp-lang-hooks` |
| JavaScript files | Snake_case where descriptive. | `post_edit_hook.mjs`, `turn_state.mjs` |
| JavaScript functions | camelCase. | `collectHookFilePaths`, `runCTest` |
| Python functions | snake_case. | `normalize_name`, `update_marketplace` |
| Constants | UPPER_SNAKE_CASE in Python; Pascal/upper-style consts in JS where existing. | `TEMPLATE_DIR`, `CPP_EXTENSIONS` |
| Hook env flags | Prefix language hook controls by language; use `"0"` for default-on disable flags and `"1"` for opt-in enable flags. | `CPP_HOOKS_FAST`, `CPP_HOOKS_TIDY_HEADERS`, `RUST_HOOKS_FAST`, `PYTHON_HOOKS_FAST` |
| Hook numeric env flags | Parse positive integers with a default fallback for bounds such as output limits. | `RUST_HOOKS_OUTPUT_MAX_CHARS` |

## Architectural Rules

- Keep hook scripts dependency-light and prefer Node built-ins over adding npm packaging.
- Hook output must be JSON written to stdout through `quitHook()`.
- Hook command execution should use `spawnSync()` with argument arrays, not shell command strings.
- Runtime hook state belongs under `PLUGIN_DATA`, not under the repository.
- Runtime hook configuration should use explicit environment flags rather than new package dependencies or repo-local mutable state.
- Shared language-hook helpers belong under `plugins/<language>/scripts/common/`; keep entry points thin and extract reusable detection or formatting logic there.
- Rust Stop-hook Clippy checks should deny warnings with `cargo clippy -- -D warnings` when enabled.
- Python hooks should resolve tools through the nearest virtualenv before falling back to global `PATH`, without shell-sourcing activation scripts.
- Template files should remain generic; language-specific behavior belongs under `plugins/<plugin-name>/`.
- **Forbidden**: overwriting existing plugin directories in the generator.

## File Organization

| What | Where | Notes |
|------|-------|-------|
| Marketplace manifest | `.agents/plugins/marketplace.json` | Repo-local plugin list. |
| Plugin sources | `plugins/<plugin-name>/` | Installable plugin metadata, hooks, and scripts. |
| Template source | `templates/language-hook-template/` | Copied by the generator. |
| Generator scripts | `scripts/` | Python utility scripts. |
| Tests | `tests/<plugin-name>/` and `tests/shared/` | Split suites use per-language `all.test.mjs`, focused `*.test.mjs`, `helpers.mjs`, and shared runtime/SQLite helpers. |
| Tracker docs | `.agents/project-tracker/` | Generated project documentation. |

## Import / Module Conventions

- **Import style**: Use explicit relative imports for local `.mjs` modules and `node:` specifiers for Node built-ins.
- **Module visibility**: Export only helpers shared by hook entry points or tests.
- **Circular dependencies**: Avoid; common helpers should not import hook entry points.

## Error Handling

- Hook scripts should block only when a required tool invocation fails; missing optional language tools are skipped.
- Failed Rust and Python command messages should use shared failure formatters so stderr/stdout labeling, exit-status fallback, and output trimming stay consistent across post-edit and Stop hooks.
- `runHook()` catches unhandled hook errors, writes `hook_errors.log` under `PLUGIN_DATA` when available, and exits non-zero.
- SQLite state helpers return booleans/null instead of throwing so hook execution can fail open.
- Python generator errors are explicit exceptions or `SystemExit` with readable messages.

## Testing Conventions

- Tests should use `node:test` and spawn real hook scripts with JSON stdin.
- Tests should create temp project fixtures and fake external tools instead of requiring system language tooling.
- Test names should describe the behavior being protected.
- Prefer small focused `*.test.mjs` modules plus `all.test.mjs` aggregators over growing one monolithic language test file.
- State-related tests should include fail-open scenarios for missing `turn_id` or `PLUGIN_DATA`.
- Failure-output tests should cover long output trimming, invalid output-limit fallback, both-stream labeling, retry-mode system messages, aggregated retry failures, and empty-output exit-status fallback.

## Documentation Conventions

- Keep `README.md` focused on repository purpose, layout, and usage.
- Project tracker docs should use English, front matter `sources`, and concrete paths from the current repo.
- For inapplicable surfaces such as network APIs, write `N/A` with the reason rather than omitting the file.

## Agent Instructions

- Prefer `rg` / `rg --files` for searching.
- Use `apply_patch` for manual file edits.
- Do not overwrite existing project tracker docs during init.
- Run focused tests after hook behavior changes.
- Preserve user or generated changes already present in the worktree.
