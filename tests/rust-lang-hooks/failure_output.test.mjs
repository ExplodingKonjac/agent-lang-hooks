import assert from "node:assert/strict";
import test from "node:test";
import {
  hookOutput,
  makeFixture,
  path,
  POST_EDIT_HOOK,
  runHook,
  STOP_HOOK,
  writeCargoLogger,
  writeFailingTool,
} from "./helpers.mjs";

test("post-edit trims long cargo stderr to the configured tail", () => {
  const fixture = makeFixture();
  const longStderr = "HEAD-" + "a".repeat(80) + "-TAIL";
  writeFailingTool(path.join(fixture.binDir, "cargo"), {
    stderr: longStderr,
    exitStatus: 2,
  });

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-trim-cargo",
      tool_name: "Edit",
      tool_input: { file_path: "src/lib.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_OUTPUT_MAX_CHARS: "40",
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

test("post-edit trims long rustfmt stdout when stderr is empty", () => {
  const fixture = makeFixture();
  const longStdout = "BEGIN-" + "b".repeat(80) + "-END";
  writeFailingTool(path.join(fixture.binDir, "rustfmt"), {
    stdout: longStdout,
    exitStatus: 3,
  });

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.standaloneDir,
      turn_id: "turn-trim-rustfmt",
      tool_name: "Edit",
      tool_input: { file_path: "main.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_OUTPUT_MAX_CHARS: "30",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = hookOutput(result);
  assert.equal(output.decision, "block");
  assert.match(output.reason, /\[output trimmed to last 30 chars\]/);
  assert.equal(output.reason.includes("BEGIN-"), false);
  assert.equal(output.reason.includes("-END"), true);
});

test("post-edit includes labeled stderr and stdout when both streams are present", () => {
  const fixture = makeFixture();
  writeFailingTool(path.join(fixture.binDir, "cargo"), {
    stderr: "stderr-one",
    stdout: "stdout-two",
    exitStatus: 4,
  });

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-both-streams",
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
  const output = hookOutput(result);
  assert.match(output.reason, /stderr:\nstderr-one/);
  assert.match(output.reason, /stdout:\nstdout-two/);
});

test("invalid output limit falls back to the default limit", () => {
  const fixture = makeFixture();
  const longStderr = "START-" + "c".repeat(4100) + "-DONE";
  writeFailingTool(path.join(fixture.binDir, "cargo"), {
    stderr: longStderr,
    exitStatus: 5,
  });

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-invalid-limit",
      tool_name: "Edit",
      tool_input: { file_path: "src/lib.rs" },
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_OUTPUT_MAX_CHARS: "nope",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = hookOutput(result);
  assert.match(output.reason, /\[output trimmed to last 4000 chars\]/);
  assert.equal(output.reason.includes("START-"), false);
  assert.equal(output.reason.includes("-DONE"), true);
});

test("Stop retry mode returns trimmed failure output in systemMessage", () => {
  const fixture = makeFixture();
  const longStderr = "FIRST-" + "d".repeat(80) + "-LAST";
  writeCargoLogger(fixture.binDir, path.join(fixture.dir, "mark.log"));

  const markResult = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-stop-trim",
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
  assert.equal(markResult.status, 0, markResult.stderr);

  writeFailingTool(path.join(fixture.binDir, "cargo"), {
    stderr: longStderr,
    exitStatus: 6,
  });

  const result = runHook(
    STOP_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-stop-trim",
      stop_hook_active: true,
    },
    {
      env: {
        PLUGIN_DATA: fixture.pluginData,
        PATH: fixture.binDir,
        RUST_HOOKS_OUTPUT_MAX_CHARS: "25",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = hookOutput(result);
  assert.equal(output.continue, true);
  assert.match(output.systemMessage, /\[output trimmed to last 25 chars\]/);
  assert.equal(output.systemMessage.includes("FIRST-"), false);
  assert.equal(output.systemMessage.includes("-LAST"), true);
});

test("empty failure output falls back to exit status", () => {
  const fixture = makeFixture();
  writeFailingTool(path.join(fixture.binDir, "cargo"), {
    exitStatus: 9,
  });

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-empty-output",
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
  const output = hookOutput(result);
  assert.match(output.reason, /exit 9/);
});
