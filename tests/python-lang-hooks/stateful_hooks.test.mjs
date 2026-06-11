import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { resolveCommand } from "../../plugins/python-lang-hooks/scripts/common/hook.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const POST_EDIT_HOOK = path.join(
  ROOT,
  "plugins/python-lang-hooks/scripts/post_edit_hook.mjs",
);
const STOP_HOOK = path.join(
  ROOT,
  "plugins/python-lang-hooks/scripts/stop_hook.mjs",
);

function makeFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "python-lang-hooks-"));
  const projectDir = path.join(dir, "project");
  const nestedProjectDir = path.join(dir, "nested");
  const standaloneDir = path.join(dir, "standalone");
  const binDir = path.join(dir, "bin");
  const pluginData = path.join(dir, "plugin-data");
  mkdirSync(path.join(projectDir, "pkg"), { recursive: true });
  mkdirSync(path.join(nestedProjectDir, "pkg"), { recursive: true });
  mkdirSync(standaloneDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(pluginData, { recursive: true });
  writeFileSync(path.join(projectDir, "pyproject.toml"), "[project]\nname = \"project\"\n");
  writeFileSync(path.join(projectDir, "pkg/module.py"), "def value():\n    return 1\n");
  writeFileSync(path.join(projectDir, "pkg/module.pyi"), "def value() -> int: ...\n");
  writeFileSync(path.join(projectDir, "README.md"), "# test\n");
  writeFileSync(path.join(nestedProjectDir, "setup.cfg"), "[metadata]\nname = nested\n");
  writeFileSync(path.join(nestedProjectDir, "pkg/module.py"), "def nested():\n    return 2\n");
  writeFileSync(path.join(standaloneDir, "script.py"), "print('hi')\n");
  return {
    dir,
    projectDir,
    nestedProjectDir,
    standaloneDir,
    binDir,
    pluginData,
  };
}

function writeExecutable(filePath, source) {
  writeFileSync(filePath, source);
  chmodSync(filePath, 0o755);
}

function writeToolLogger(binDir, toolName, logPath, { exitStatus = 0 } = {}) {
  writeExecutable(
    path.join(binDir, toolName),
    `#!/bin/sh\nprintf '${toolName}:%s:%s\\n' "$PWD" "$*" >> "${logPath}"\nexit ${exitStatus}\n`,
  );
}

function writeNamedToolLogger(
  binDir,
  toolName,
  logName,
  logPath,
  { exitStatus = 0 } = {},
) {
  writeExecutable(
    path.join(binDir, toolName),
    `#!/bin/sh\nprintf '${logName}:%s:%s\\n' "$PWD" "$*" >> "${logPath}"\nexit ${exitStatus}\n`,
  );
}

function writePythonLogger(binDir, logPath, { exitStatus = 0 } = {}) {
  writeExecutable(
    path.join(binDir, "python"),
    `#!/bin/sh\nprintf 'python:%s:%s\\n' "$PWD" "$*" >> "${logPath}"\nexit ${exitStatus}\n`,
  );
}

function writeFailingTool(filePath, { stdout = "", stderr = "", exitStatus = 1 }) {
  const stdoutLine = stdout ? `printf '%s' '${stdout}'\n` : "";
  const stderrLine = stderr ? `printf '%s' '${stderr}' >&2\n` : "";
  writeExecutable(
    filePath,
    `#!/bin/sh\n${stdoutLine}${stderrLine}exit ${exitStatus}\n`,
  );
}

function makeVenv(projectDir) {
  const venvBin = path.join(projectDir, ".venv", "bin");
  mkdirSync(venvBin, { recursive: true });
  return venvBin;
}

function runHook(script, input, { env = {}, cwd = ROOT } = {}) {
  return spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

function readPythonChanged(pluginData, turnId) {
  const dbPath = path.join(pluginData, "python-lang-hooks.sqlite3");
  if (!existsSync(dbPath)) {
    return null;
  }

  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare("SELECT python_changed FROM turn_file_changes WHERE turn_id = ?")
      .get(turnId);
    return row ? row.python_changed : null;
  } finally {
    db.close();
  }
}

function readProjectRoots(pluginData, turnId) {
  const dbPath = path.join(pluginData, "python-lang-hooks.sqlite3");
  if (!existsSync(dbPath)) {
    return [];
  }

  const db = new DatabaseSync(dbPath);
  try {
    return db
      .prepare(
        "SELECT project_root FROM turn_python_projects WHERE turn_id = ? ORDER BY project_root",
      )
      .all(turnId)
      .map((row) => row.project_root);
  } finally {
    db.close();
  }
}

function readLines(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  return readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
}

function hookOutput(result) {
  return JSON.parse(result.stdout);
}

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
  for (const tool of ["mypy", "ruff", "pytest"]) writeToolLogger(fixture.binDir, tool, logPath);
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
    { env: { PLUGIN_DATA: "", PATH: fixture.binDir, PYTHON_HOOKS_LINT: "0", PYTHON_HOOKS_TEST: "0", PYTHON_HOOKS_OUTPUT_MAX_CHARS: "40" } },
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

test("resolveCommand keeps venv executable priority over PATH tools", () => {
  const fixture = makeFixture();
  const toolName = "fixture-venv-priority-tool";
  const venvBin = makeVenv(fixture.projectDir);
  writeToolLogger(fixture.binDir, toolName, path.join(fixture.dir, "global.log"));
  writeToolLogger(venvBin, toolName, path.join(fixture.dir, "venv.log"));

  const previousPath = process.env.PATH;
  process.env.PATH = fixture.binDir;
  try {
    const resolved = resolveCommand(toolName, path.join(fixture.projectDir, "pkg"));

    assert.ok(resolved);
    assert.equal(resolved.command, path.join(venvBin, toolName));
  } finally {
    process.env.PATH = previousPath;
  }
});

test("resolveCommand memoizes command lookup per command name and start directory", () => {
  const fixture = makeFixture();
  const toolName = "fixture-memoized-tool";
  const venvBin = makeVenv(fixture.projectDir);
  const toolPath = path.join(venvBin, toolName);
  writeToolLogger(venvBin, toolName, path.join(fixture.dir, "memoized.log"));

  const previousPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const startDir = path.join(fixture.projectDir, "pkg");
    const first = resolveCommand(toolName, startDir);
    unlinkSync(toolPath);
    const second = resolveCommand(toolName, startDir);

    assert.ok(first);
    assert.strictEqual(second, first);
    assert.equal(second.command, toolPath);
  } finally {
    process.env.PATH = previousPath;
  }
});
