import assert from "node:assert/strict";
import test from "node:test";
import {
  hookOutput,
  makeFixture,
  path,
  POST_EDIT_HOOK,
  readLines,
  runHook,
  STOP_HOOK,
  writeFailingTool,
  writeToolLogger,
} from "./helpers.mjs";

test("failed Stop command blocks normally and reports systemMessage in retry mode", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "fail-fast.log");
  writeFailingTool(path.join(fixture.binDir, "mypy"), {
    stderr: "type error",
    exitStatus: 2,
  });
  writeToolLogger(fixture.binDir, "ruff", logPath);
  writeToolLogger(fixture.binDir, "pytest", logPath);

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-fail",
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

  const blockResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-fail" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(blockResult.status, 0, blockResult.stderr);
  assert.equal(hookOutput(blockResult).decision, "block");
  assert.match(hookOutput(blockResult).reason, /mypy.*failed: type error/);
  assert.deepEqual(readLines(logPath), []);

  const retryResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-fail", stop_hook_active: true },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        PYTHON_HOOKS_LINT: "0",
        PYTHON_HOOKS_TEST: "0",
      },
    },
  );

  assert.equal(retryResult.status, 0, retryResult.stderr);
  const retryOutput = hookOutput(retryResult);
  assert.equal(retryOutput.continue, true);
  assert.match(retryOutput.systemMessage, /mypy.*still failed: type error/);
});

test("retry Stop aggregates failures across projects and commands", () => {
  const fixture = makeFixture();
  writeFailingTool(path.join(fixture.binDir, "mypy"), { stderr: "type error" });
  writeFailingTool(path.join(fixture.binDir, "ruff"), { stderr: "lint error" });
  writeFailingTool(path.join(fixture.binDir, "pytest"), { stderr: "test error" });
  const env = {
    PLUGIN_DATA: fixture.pluginData,
    PATH: fixture.binDir,
    PYTHON_HOOKS_FORMAT: "0",
  };

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.dir,
      turn_id: "turn-retry-aggregate",
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
    { env },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.dir, turn_id: "turn-retry-aggregate", stop_hook_active: true },
    { env },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = hookOutput(result);
  const messages = output.systemMessage.split("\n\n");
  assert.equal(output.continue, true);
  assert.equal(output.decision, undefined);
  assert.equal(messages.length, 6);
  assert.match(messages[0], /mypy.*nested.*still failed: type error/);
  assert.match(messages[1], /ruff.*nested.*still failed: lint error/);
  assert.match(messages[2], /pytest.*nested.*still failed: test error/);
  assert.match(messages[3], /mypy.*project.*still failed: type error/);
  assert.match(messages[4], /ruff.*project.*still failed: lint error/);
  assert.match(messages[5], /pytest.*project.*still failed: test error/);
});

test("retry Stop with passing checks returns only continue true", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "retry-ok.log");
  for (const tool of ["mypy", "ruff", "pytest"]) {
    writeToolLogger(fixture.binDir, tool, logPath);
  }
  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, stop_hook_active: true },
    { env: { PLUGIN_DATA: "", PATH: fixture.binDir } },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(hookOutput(result), { continue: true });
});

test("retry Stop aggregation trims long failed command output", () => {
  const fixture = makeFixture();
  writeFailingTool(path.join(fixture.binDir, "mypy"), {
    stderr: "HEAD-" + "a".repeat(80) + "-TAIL",
  });
  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, stop_hook_active: true },
    {
      env: {
        PLUGIN_DATA: "",
        PATH: fixture.binDir,
        PYTHON_HOOKS_LINT: "0",
        PYTHON_HOOKS_TEST: "0",
        PYTHON_HOOKS_OUTPUT_MAX_CHARS: "40",
      },
    },
  );
  const message = hookOutput(result).systemMessage;
  assert.equal(result.status, 0, result.stderr);
  assert.match(message, /\[output trimmed to last 40 chars\]/);
  assert.equal(message.includes("HEAD-"), false);
  assert.equal(message.includes("-TAIL"), true);
});

test("long failed command output is trimmed by PYTHON_HOOKS_OUTPUT_MAX_CHARS", () => {
  const fixture = makeFixture();
  const longStderr = "HEAD-" + "a".repeat(80) + "-TAIL";
  writeFailingTool(path.join(fixture.binDir, "mypy"), {
    stderr: longStderr,
    exitStatus: 2,
  });

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-trim",
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
    { cwd: fixture.projectDir, turn_id: "turn-trim" },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        PYTHON_HOOKS_LINT: "0",
        PYTHON_HOOKS_TEST: "0",
        PYTHON_HOOKS_OUTPUT_MAX_CHARS: "40",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = hookOutput(result);
  assert.equal(output.decision, "block");
  assert.match(output.reason, /\[output trimmed to last 40 chars\]/);
  assert.equal(output.reason.includes("HEAD-"), false);
  assert.equal(output.reason.includes("-TAIL"), true);
});
