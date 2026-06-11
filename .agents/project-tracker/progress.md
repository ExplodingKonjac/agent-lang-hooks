# Progress & Roadmap

## Current Phase

Early plugin marketplace with C++, Rust, and Python hook extraction plus split regression coverage.

## Completed

- [x] Created base repository structure with plugin marketplace, language template, and generator script.
- [x] Added C++ language hook plugin metadata and hook registrations.
- [x] Implemented C++ post-edit formatting and tidy checks for C/C++ files.
- [x] Implemented C++ stop hook for CMake/`ctest` projects.
- [x] Added SQLite-backed per-turn C++ change state to avoid redundant `ctest` runs.
- [x] Added Node hook-level regression tests for C++ stateful behavior.
- [x] Marked deleted or moved C/C++ paths as test-triggering changes while keeping format/tidy limited to existing files.
- [x] Added Stop-hook `cmake --build` before `ctest` with fail-open handling for missing `cmake`.
- [x] Added ordered CMake build directory detection for `build/`, `cmake-build-debug/`, `cmake-build-release/`, and `out/build/`.
- [x] Optimized C++ post-edit hooks with normalized path dedupe, source/header tidy separation, and per-process CMake lookup caches.
- [x] Added `CPP_HOOKS_*` environment flags for format, tidy, header tidy, CTest, and fast-mode behavior.
- [x] Documented C++ hook configuration in `README.md` and expanded hook regression tests for the new performance controls.
- [x] Added Rust language hook plugin metadata and hook registrations.
- [x] Implemented Rust post-edit formatting with `cargo fmt` for Cargo projects and `rustfmt` for standalone `.rs` files.
- [x] Implemented Rust stop hook for `cargo check`, `cargo clippy`, and `cargo test`.
- [x] Tightened Rust stop-hook Clippy checks to run with `-- -D warnings`.
- [x] Added SQLite-backed per-turn Rust change state with affected Cargo project tracking.
- [x] Added `RUST_HOOKS_*` environment flags for Cargo formatting, standalone rustfmt, Cargo Stop checks, and fast-mode behavior.
- [x] Added Node hook-level regression tests for Rust stateful behavior.
- [x] Moved hook path normalization and deduplication into shared `collectHookFilePaths(input, cwd)` helpers across C++, Rust, and the template.
- [x] Added shared Rust command failure formatting with stdout/stderr labeling, exit-status fallback, and configurable tail trimming via `RUST_HOOKS_OUTPUT_MAX_CHARS`.
- [x] Added Rust hook regression tests for trimmed failure output, invalid output-limit fallback, both-stream output, retry-mode messages, and empty-output failures.
- [x] Added Python language hook plugin metadata, marketplace entry, and hook registrations.
- [x] Implemented Python post-edit formatting with formatter priority `ruff`, `black` plus optional `isort`, then `yapf`.
- [x] Implemented Python Stop checks with type checker, linter, and test runner candidate selection.
- [x] Added nearest-virtualenv tool resolution with global tool fallback for Python hooks.
- [x] Added SQLite-backed per-turn Python change state with affected Python project root tracking.
- [x] Added `PYTHON_HOOKS_*` environment flags for formatting, type checking, linting, tests, fast mode, and failed-output trimming.
- [x] Added Python change detection for `.py`, `.pyi`, and common Python config files.
- [x] Added per-process Python helper caches for project root, virtualenv, PATH, and command resolution.
- [x] Added Python retry-mode Stop aggregation so multiple failures are reported in one `systemMessage`.
- [x] Added Node hook-level regression tests for Python formatting, stateful Stop behavior, virtualenv resolution, command memoization, and failure-output handling.
- [x] Extracted shared helper modules for C++ CMake build-dir discovery, Rust/Python failure-output formatting, and Python runtime/tool resolution.
- [x] Reorganized the C++, Rust, and Python hook tests into focused `*.test.mjs` files with per-language aggregators and shared runtime/SQLite helpers.
- [x] Added a top-level `tests/all.test.mjs` suite that also asserts each plugin's shared `hook.mjs` matches the template copy exactly.

## In Progress

- [ ] Align marketplace entry naming/path with the actual `plugins/cpp-lang-hooks` directory if needed.
- [ ] Decide whether Rust and Python hook state/failure-output controls should be documented in `data-model.md` if that tracker file's source boundary is expanded later.

## Known Issues & Technical Debt

- No CI pipeline currently runs the Node hook tests automatically.
- No repository-level formatter or lint configuration is present.
- `scripts/__pycache__/` exists in the worktree and is generated Python cache output.
- Old SQLite turn records are not pruned.

## Roadmap

- [ ] Add more language hook plugins using the template generator.
- [ ] Add CI for `node --test`, `node --check`, and Python generator smoke tests.
- [ ] Add pruning or retention policy for hook state if the SQLite file grows.
- [?] Add documentation or validation for plugin marketplace entry consistency.
