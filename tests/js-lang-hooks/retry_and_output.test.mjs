import assert from "node:assert/strict";
import test from "node:test";
import {
  hookOutput,
  makeFixture,
  path,
  POST_EDIT_HOOK,
  runHook,
  STOP_HOOK,
  writeFailingTool,
  writeToolLogger,
} from "./helpers.mjs";

test("failed Stop command blocks normally and reports systemMessage in retry mode", () => {
  const fixture = makeFixture();
  writeFailingTool(path.join(fixture.binDir, "eslint"), {
    stderr: "lint error",
    exitStatus: 2,
  });
  writeToolLogger(fixture.binDir, "vitest", path.join(fixture.dir, "tools.log"));

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-fail",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.js" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FORMAT: "0",
        JS_HOOKS_TYPECHECK: "0",
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
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );
  assert.equal(blockResult.status, 0, blockResult.stderr);
  assert.match(
    hookOutput(blockResult).reason,
    /eslint .*src\/index\.js.*failed: lint error/,
  );

  const retryResult = runHook(
    STOP_HOOK,
    { cwd: fixture.projectDir, turn_id: "turn-fail", stop_hook_active: true },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_TYPECHECK: "0",
        JS_HOOKS_TEST: "0",
      },
    },
  );
  assert.equal(retryResult.status, 0, retryResult.stderr);
  assert.match(
    hookOutput(retryResult).systemMessage,
    /eslint .*src\/index\.js.*still failed: lint error/,
  );
});

test("retry Stop aggregates failures across projects and commands", () => {
  const fixture = makeFixture();
  writeFailingTool(path.join(fixture.binDir, "eslint"), { stderr: "lint error" });
  writeFailingTool(path.join(fixture.binDir, "vitest"), { stderr: "test error" });

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.dir,
      turn_id: "turn-aggregate",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: project/src/index.js",
          "*** Update File: nested/src/nested.ts",
          "*** End Patch",
        ].join("\n"),
      },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FORMAT: "0",
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );
  assert.equal(postResult.status, 0, postResult.stderr);

  const result = runHook(
    STOP_HOOK,
    { cwd: fixture.dir, turn_id: "turn-aggregate", stop_hook_active: true },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_TYPECHECK: "0",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const messages = hookOutput(result).systemMessage.split("\n\n");
  assert.equal(messages.length, 4);
  assert.match(messages[0], /eslint .*nested\/src\/nested\.ts.*still failed: lint error/);
  assert.match(messages[1], /vitest run.*nested.*still failed: test error/);
  assert.match(messages[2], /eslint .*project\/src\/index\.js.*still failed: lint error/);
  assert.match(messages[3], /vitest run.*project.*still failed: test error/);
});

test("long failed command output is trimmed and invalid limits fall back to the default", () => {
  const fixture = makeFixture();
  writeFailingTool(path.join(fixture.binDir, "eslint"), {
    stderr: "HEAD-" + "a".repeat(4100) + "-TAIL",
    exitStatus: 3,
  });

  const postResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-trim",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.js" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        JS_HOOKS_FORMAT: "0",
        JS_HOOKS_TYPECHECK: "0",
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
        JS_HOOKS_TYPECHECK: "0",
        JS_HOOKS_TEST: "0",
        JS_HOOKS_OUTPUT_MAX_CHARS: "nope",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = hookOutput(result);
  assert.match(output.reason, /\[output trimmed to last 4000 chars\]/);
  assert.equal(output.reason.includes("HEAD-"), false);
  assert.equal(output.reason.includes("-TAIL"), true);
});

test("failed formatter output includes both labeled streams and exit-status fallback works", () => {
  const fixture = makeFixture();
  writeFailingTool(path.join(fixture.binDir, "prettier"), {
    stderr: "stderr-one",
    stdout: "stdout-two",
    exitStatus: 4,
  });

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-streams",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.ts" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = hookOutput(result);
  assert.match(output.reason, /stderr:\nstderr-one/);
  assert.match(output.reason, /stdout:\nstdout-two/);

  writeFailingTool(path.join(fixture.binDir, "prettier"), { exitStatus: 9 });
  const emptyOutputResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-empty",
      tool_name: "Edit",
      tool_input: { file_path: "src/index.ts" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
      },
    },
  );
  assert.equal(emptyOutputResult.status, 0, emptyOutputResult.stderr);
  assert.match(hookOutput(emptyOutputResult).reason, /exit 9/);
});
