import assert from "node:assert/strict";
import test from "node:test";
import {
  makeFixture,
  path,
  POST_EDIT_HOOK,
  readLines,
  readProjectRoots,
  readPythonChanged,
  runHook,
  writeFileSync,
  writeToolLogger,
} from "./helpers.mjs";

test("post-edit Python file marks the turn and runs ruff format from the project root", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "ruff.log");
  writeToolLogger(fixture.binDir, "ruff", logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-python-ruff",
      tool_name: "Edit",
      tool_input: { file_path: "pkg/module.py" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `ruff:${fixture.projectDir}:format ${path.join(fixture.projectDir, "pkg/module.py")}`,
  ]);
  assert.equal(readPythonChanged(fixture.pluginData, "turn-python-ruff"), 1);
  assert.deepEqual(readProjectRoots(fixture.pluginData, "turn-python-ruff"), [
    fixture.projectDir,
  ]);
});

test("post-edit Python interface file marks the turn and runs ruff format", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "pyi.log");
  writeToolLogger(fixture.binDir, "ruff", logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-python-pyi",
      tool_name: "Edit",
      tool_input: { file_path: "pkg/module.pyi" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `ruff:${fixture.projectDir}:format ${path.join(fixture.projectDir, "pkg/module.pyi")}`,
  ]);
  assert.equal(readPythonChanged(fixture.pluginData, "turn-python-pyi"), 1);
  assert.deepEqual(readProjectRoots(fixture.pluginData, "turn-python-pyi"), [
    fixture.projectDir,
  ]);
});

test("post-edit non-Python file does not mark the turn", () => {
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
  assert.equal(readPythonChanged(fixture.pluginData, "turn-docs"), null);
});

test("post-edit Python config file marks the turn without formatting", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "config.log");
  writeFileSync(path.join(fixture.projectDir, "mypy.ini"), "[mypy]\n");
  writeToolLogger(fixture.binDir, "ruff", logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-python-config",
      tool_name: "Edit",
      tool_input: { file_path: "mypy.ini" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), []);
  assert.equal(readPythonChanged(fixture.pluginData, "turn-python-config"), 1);
  assert.deepEqual(readProjectRoots(fixture.pluginData, "turn-python-config"), [
    fixture.projectDir,
  ]);
});

test("post-edit deleted Python file marks the turn without formatting missing files", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "delete.log");
  writeToolLogger(fixture.binDir, "ruff", logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-delete",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Delete File: pkg/removed.py",
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
  assert.equal(readPythonChanged(fixture.pluginData, "turn-delete"), 1);
  assert.deepEqual(readLines(logPath), []);
});

test("post-edit deleted or moved Python config path marks the turn without formatting", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "deleted-config.log");
  writeToolLogger(fixture.binDir, "ruff", logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-config-patch",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Delete File: ruff.toml",
          "*** Update File: tool.toml",
          "*** Move to: pyrightconfig.json",
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
  assert.deepEqual(readLines(logPath), []);
  assert.equal(readPythonChanged(fixture.pluginData, "turn-config-patch"), 1);
  assert.deepEqual(readProjectRoots(fixture.pluginData, "turn-config-patch"), [
    fixture.projectDir,
  ]);
});
