import assert from "node:assert/strict";
import test from "node:test";
import {
  makeFixture,
  path,
  POST_EDIT_HOOK,
  readLines,
  runHook,
  STOP_HOOK,
  writeCargoLogger,
  writeRustfmtLogger,
} from "./helpers.mjs";

test("Stop runs Cargo checks for each affected Cargo project in order", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "multi-project.log");
  writeCargoLogger(fixture.binDir, logPath);

  const markResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.dir,
      turn_id: "turn-multi-project",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: project/src/lib.rs",
          "*** Update File: nested/src/lib.rs",
          "*** End Patch",
        ].join("\n"),
      },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );
  assert.equal(markResult.status, 0, markResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.dir, turn_id: "turn-multi-project" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `cargo:${fixture.nestedProjectDir}:fmt`,
    `cargo:${fixture.projectDir}:fmt`,
    `cargo:${fixture.nestedProjectDir}:check`,
    `cargo:${fixture.nestedProjectDir}:clippy -- -D warnings`,
    `cargo:${fixture.nestedProjectDir}:test`,
    `cargo:${fixture.projectDir}:check`,
    `cargo:${fixture.projectDir}:clippy -- -D warnings`,
    `cargo:${fixture.projectDir}:test`,
  ]);
});

test("environment flags disable formatters and Stop checks", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "flags.log");
  writeCargoLogger(fixture.binDir, logPath);
  writeRustfmtLogger(fixture.binDir, logPath);

  const postCargoResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-cargo-flags",
      tool_name: "Edit",
      tool_input: { file_path: "src/lib.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_CARGO_FMT: "0",
      },
    },
  );
  assert.equal(postCargoResult.status, 0, postCargoResult.stderr);

  const postStandaloneResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.standaloneDir,
      turn_id: "turn-rustfmt-flags",
      tool_name: "Edit",
      tool_input: { file_path: "main.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_RUSTFMT: "0",
      },
    },
  );
  assert.equal(postStandaloneResult.status, 0, postStandaloneResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-cargo-flags" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_CARGO_CHECK: "0",
        RUST_HOOKS_CARGO_CLIPPY: "0",
        RUST_HOOKS_CARGO_TEST: "0",
      },
    },
  );

  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.deepEqual(readLines(logPath), []);
});

test("fast mode skips Stop checks but keeps formatting", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "fast.log");
  writeCargoLogger(fixture.binDir, logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-fast",
      tool_name: "Edit",
      tool_input: { file_path: "src/lib.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_FAST: "1",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-fast" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_FAST: "1",
      },
    },
  );

  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.deepEqual(readLines(logPath), [`cargo:${fixture.projectDir}:fmt`]);
});

test("Stop skips when the turn has no Rust changes", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "skip.log");
  writeCargoLogger(fixture.binDir, logPath);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-skip" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{"continue":true}');
  assert.deepEqual(readLines(logPath), []);
});

test("missing PLUGIN_DATA fails open and checks the current Cargo project", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "fail-open.log");
  writeCargoLogger(fixture.binDir, logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-no-data",
      tool_name: "Edit",
      tool_input: { file_path: "src/lib.rs" },
    },
    {
      env: {
        PLUGIN_DATA: "",
        PATH: fixture.binDir,
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-no-data" },
    {
      env: {
        PLUGIN_DATA: "",
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.deepEqual(readLines(logPath), [
    `cargo:${fixture.projectDir}:fmt`,
    `cargo:${fixture.projectDir}:check`,
    `cargo:${fixture.projectDir}:clippy -- -D warnings`,
    `cargo:${fixture.projectDir}:test`,
  ]);
});
