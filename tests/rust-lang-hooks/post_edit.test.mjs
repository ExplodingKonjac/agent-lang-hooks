import assert from "node:assert/strict";
import test from "node:test";
import {
  makeFixture,
  path,
  POST_EDIT_HOOK,
  readCargoProjects,
  readLines,
  readRustChanged,
  runHook,
  STOP_HOOK,
  writeCargoLogger,
  writeFileSync,
  writeRustfmtLogger,
} from "./helpers.mjs";

test("post-edit Rust file in Cargo project marks the turn and runs cargo fmt from the manifest directory", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "tools.log");
  writeCargoLogger(fixture.binDir, logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-cargo-rust",
      tool_name: "Edit",
      tool_input: { file_path: "src/lib.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [`cargo:${fixture.projectDir}:fmt`]);
  assert.equal(readRustChanged(fixture.pluginData, "turn-cargo-rust"), 1);
  assert.deepEqual(readCargoProjects(fixture.pluginData, "turn-cargo-rust"), [
    fixture.projectDir,
  ]);
});

test("post-edit standalone Rust file marks the turn and runs rustfmt without recording Cargo checks", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "standalone.log");
  const standaloneFile = path.join(fixture.standaloneDir, "main.rs");
  writeCargoLogger(fixture.binDir, logPath);
  writeRustfmtLogger(fixture.binDir, logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.standaloneDir,
      turn_id: "turn-standalone",
      tool_name: "Edit",
      tool_input: { file_path: "main.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.standaloneDir, turn_id: "turn-standalone" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.equal(stopResult.stdout, '{"continue":true}');
  assert.deepEqual(readLines(logPath), [`rustfmt:${standaloneFile}`]);
  assert.equal(readRustChanged(fixture.pluginData, "turn-standalone"), 1);
  assert.deepEqual(
    readCargoProjects(fixture.pluginData, "turn-standalone"),
    [],
  );
});

test("post-edit non-Rust file does not mark the turn", () => {
  const fixture = makeFixture();
  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-docs",
      tool_name: "Edit",
      tool_input: { file_path: "README.md" },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readRustChanged(fixture.pluginData, "turn-docs"), null);
});

test("post-edit deleted Rust file marks the turn without formatting missing files", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "delete.log");
  writeCargoLogger(fixture.binDir, logPath);
  writeRustfmtLogger(fixture.binDir, logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-delete",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Delete File: src/removed.rs",
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

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readRustChanged(fixture.pluginData, "turn-delete"), 1);
  assert.deepEqual(readLines(logPath), []);
});

test("post-edit deduplicates multiple Rust files in the same Cargo project", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "dedupe.log");
  writeCargoLogger(fixture.binDir, logPath);
  writeFileSync(
    path.join(fixture.projectDir, "src/other.rs"),
    "pub fn other() {}\n",
  );

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-dedupe",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: src/lib.rs",
          "*** Update File: ./src/lib.rs",
          "*** Update File: src/other.rs",
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

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [`cargo:${fixture.projectDir}:fmt`]);
  assert.deepEqual(readCargoProjects(fixture.pluginData, "turn-dedupe"), [
    fixture.projectDir,
  ]);
});
