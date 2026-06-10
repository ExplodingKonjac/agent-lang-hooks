# Progress & Roadmap

## Current Phase

Early plugin marketplace with C++ and Rust hook stabilization.

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
- [x] Added SQLite-backed per-turn Rust change state with affected Cargo project tracking.
- [x] Added `RUST_HOOKS_*` environment flags for Cargo formatting, standalone rustfmt, Cargo Stop checks, and fast-mode behavior.
- [x] Added Node hook-level regression tests for Rust stateful behavior.
- [x] Moved hook path normalization and deduplication into shared `collectHookFilePaths(input, cwd)` helpers across C++, Rust, and the template.

## In Progress

- [ ] Align marketplace entry naming/path with the actual `plugins/cpp-lang-hooks` directory if needed.
- [ ] Decide whether Rust hook state should be documented in `data-model.md` if that tracker file's source boundary is expanded later.

## Known Issues & Technical Debt

- No CI pipeline currently runs the Node hook tests automatically.
- No repository-level formatter or lint configuration is present.
- `scripts/__pycache__/` exists in the worktree and is generated Python cache output.
- Old SQLite turn records are not pruned.
- `data-model.md` is unchanged because its current tracker source boundary was marked OK by staleness detection.

## Roadmap

- [ ] Add more language hook plugins using the template generator.
- [ ] Add CI for `node --test`, `node --check`, and Python generator smoke tests.
- [ ] Add pruning or retention policy for hook state if the SQLite file grows.
- [?] Add documentation or validation for plugin marketplace entry consistency.
