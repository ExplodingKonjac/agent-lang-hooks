import assert from "node:assert/strict";
import test from "node:test";
import {
  makeFixture,
  makeVenv,
  path,
  POST_EDIT_HOOK,
  readLines,
  runHook,
  writeNamedToolLogger,
  writeToolLogger,
} from "./helpers.mjs";

test("formatter priority uses black with optional isort before yapf when ruff is missing", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "black.log");
  writeToolLogger(fixture.binDir, "black", logPath);
  writeToolLogger(fixture.binDir, "isort", logPath);
  writeToolLogger(fixture.binDir, "yapf", logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-black",
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
    `isort:${fixture.projectDir}:${path.join(fixture.projectDir, "pkg/module.py")}`,
    `black:${fixture.projectDir}:${path.join(fixture.projectDir, "pkg/module.py")}`,
  ]);
});

test("nearest venv tool is preferred over global tool", () => {
  const fixture = makeFixture();
  const logPath = path.join(fixture.dir, "venv.log");
  const venvBin = makeVenv(fixture.projectDir);
  writeToolLogger(fixture.binDir, "ruff", logPath);
  writeNamedToolLogger(venvBin, "ruff", "venv-ruff", logPath);

  const result = runHook(
    POST_EDIT_HOOK,
    {
      cwd: fixture.projectDir,
      turn_id: "turn-venv",
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
    `venv-ruff:${fixture.projectDir}:format ${path.join(fixture.projectDir, "pkg/module.py")}`,
  ]);
});
