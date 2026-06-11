import assert from "node:assert/strict";
import test from "node:test";
import { resolveCommand } from "../../plugins/python-lang-hooks/scripts/common/python_runtime.mjs";
import {
  makeFixture,
  makeVenv,
  path,
  unlinkSync,
  writeToolLogger,
} from "./helpers.mjs";

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
