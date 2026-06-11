import assert from "node:assert/strict";
import test from "node:test";
import {
  makeFixture,
  path,
  POST_EDIT_HOOK,
  readLines,
  runHook,
  STOP_HOOK,
  writePythonLogger,
  writeToolLogger,
} from "./helpers.mjs";

test("Stop runs first available type checker, linter, and test runner for touched projects", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "stop.log");
  writeToolLogger(fixture.binDir, "pyright", logPath);
  writeToolLogger(fixture.binDir, "pylint", logPath);
  writeToolLogger(fixture.binDir, "pytest", logPath);

  const markResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.dir,
      turn_id: "turn-stop",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: project/pkg/module.py",
          "*** Update File: nested/pkg/module.py",
          "*** End Patch",
        ].join("\n"),
      },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        PYTHON_HOOKS_FORMAT: "0",
      },
    },
  );
  assert.equal(markResult.status, 0, markResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.dir, turn_id: "turn-stop" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `pyright:${fixture.nestedProjectDir}:`,
    `pylint:${fixture.nestedProjectDir}:.`,
    `pytest:${fixture.nestedProjectDir}:`,
    `pyright:${fixture.projectDir}:`,
    `pylint:${fixture.projectDir}:.`,
    `pytest:${fixture.projectDir}:`,
  ]);
});

test("Stop uses unittest through python when pytest is unavailable", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "unittest.log");
  writePythonLogger(fixture.binDir, logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-unittest",
      tool_name: "Edit",
      tool_input: { file_path: "pkg/module.py" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        PYTHON_HOOKS_FORMAT: "0",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-unittest" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        PYTHON_HOOKS_TYPECHECK: "0",
        PYTHON_HOOKS_LINT: "0",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `python:${fixture.projectDir}:-m unittest discover`,
  ]);
});

test("fast mode and per-category flags disable expected checks", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "flags.log");
  writeToolLogger(fixture.binDir, "ruff", logPath);
  writeToolLogger(fixture.binDir, "mypy", logPath);
  writeToolLogger(fixture.binDir, "pytest", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-flags",
      tool_name: "Edit",
      tool_input: { file_path: "pkg/module.py" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        PYTHON_HOOKS_FAST: "1",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const stopResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-flags" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        PYTHON_HOOKS_FAST: "1",
      },
    },
  );

  assert.equal(stopResult.status, 0, stopResult.stderr);
  assert.deepEqual(readLines(logPath), [
    `ruff:${fixture.projectDir}:format ${path.join(fixture.projectDir, "pkg/module.py")}`,
  ]);
});

test("missing PLUGIN_DATA fails open to current Python project root", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "fail-open.log");
  writeToolLogger(fixture.binDir, "mypy", logPath);
  writeToolLogger(fixture.binDir, "ruff", logPath);
  writeToolLogger(fixture.binDir, "pytest", logPath);

  const result = runHook(
    STOP_HOOK,
    { cwd: path.join(fixture.projectDir, "pkg"), turn_id: "turn-no-data" },
    {
      env: {
        PLUGIN_DATA: "",
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readLines(logPath), [
    `mypy:${fixture.projectDir}:.`,
    `ruff:${fixture.projectDir}:check .`,
    `pytest:${fixture.projectDir}:`,
  ]);
});
