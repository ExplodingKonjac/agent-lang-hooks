import assert from "node:assert/strict";
import test from "node:test";
import {
  makeFixture,
  path,
  POST_EDIT_HOOK,
  readCppChanged,
  runHook,
} from "./helpers.mjs";

test("post-edit C++ file marks the turn as changed", () => {
  const fixture = makeFixture();
  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-cpp",
      tool_name: "Edit",
      tool_input: { file_path: "main.cpp" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH}`,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readCppChanged(fixture.pluginData, "turn-cpp"), 1);
});

test("post-edit non-C++ file does not mark the turn", () => {
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
  assert.equal(readCppChanged(fixture.pluginData, "turn-docs"), null);
});

test("post-edit deleted C++ file marks the turn as changed", () => {
  const fixture = makeFixture();
  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-delete",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Delete File: removed.cpp",
          "*** End Patch",
        ].join("\n"),
      },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readCppChanged(fixture.pluginData, "turn-delete"), 1);
});

test("post-edit renamed C++ source path marks the turn as changed", () => {
  const fixture = makeFixture();
  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-rename",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: old.cpp",
          "*** Move to: docs/old.txt",
          "*** End Patch",
        ].join("\n"),
      },
    },
    { env: { PLUGIN_DATA: fixture.pluginData } },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readCppChanged(fixture.pluginData, "turn-rename"), 1);
});

test("multiple C++ edits in one turn keep the turn marked changed", () => {
  const fixture = makeFixture();
  for (const filePath of ["main.cpp", "main.cpp"]) {
    const result = runHook(
      POST_EDIT_HOOK,
      {
        cwd: fixture.projectDir,
        turn_id: "turn-repeat",
        tool_name: "Edit",
        tool_input: { file_path: filePath },
      },
      { env: { PLUGIN_DATA: fixture.pluginData } },
    );
    assert.equal(result.status, 0, result.stderr);
  }

  assert.equal(readCppChanged(fixture.pluginData, "turn-repeat"), 1);
});
