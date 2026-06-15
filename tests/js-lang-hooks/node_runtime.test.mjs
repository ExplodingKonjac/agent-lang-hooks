import assert from "node:assert/strict";
import test from "node:test";
import {
  currentNodeProjectRoot,
  findNearestNodeProjectRoot,
  hasPackageScript,
  hasTypeScriptConfig,
  nodeProjectRootForPath,
  packageManagerForProject,
  tsConfigError,
  resolveCommand,
  resolvePackageScript,
} from "../../plugins/js-lang-hooks/scripts/common/node_runtime.mjs";
import {
  makeFixture,
  makeNodeModulesBin,
  path,
  unlinkSync,
  writeNamedToolLogger,
  writePackageJson,
  writeToolLogger,
  writeFileSync,
} from "./helpers.mjs";

test("project root discovery finds the nearest package boundary", () => {
  const fixture = makeFixture();

  assert.equal(
    findNearestNodeProjectRoot(path.join(fixture.projectDir, "src")),
    fixture.projectDir,
  );
  assert.equal(
    nodeProjectRootForPath(path.join(fixture.nestedProjectDir, "src/nested.ts")),
    fixture.nestedProjectDir,
  );
  assert.equal(
    currentNodeProjectRoot({ cwd: path.join(fixture.projectDir, "src") }),
    fixture.projectDir,
  );
});

test("resolveCommand prefers local node_modules bin and memoizes by start directory", () => {
  const fixture = makeFixture();
  const toolName = "fixture-node-local-tool";
  const localBin = makeNodeModulesBin(fixture.projectDir);
  const toolPath = path.join(localBin, toolName);
  writeToolLogger(fixture.binDir, toolName, path.join(fixture.dir, "global.log"));
  writeNamedToolLogger(localBin, toolName, "local-tool", path.join(fixture.dir, "local.log"));

  const previousPath = process.env.PATH;
  process.env.PATH = fixture.binDir;
  try {
    const startDir = path.join(fixture.projectDir, "src");
    const first = resolveCommand(toolName, startDir);
    unlinkSync(toolPath);
    const second = resolveCommand(toolName, startDir);

    assert.ok(first);
    assert.equal(first.command, toolPath);
    assert.strictEqual(second, first);
  } finally {
    process.env.PATH = previousPath;
  }
});

test("package manager, scripts, and TypeScript config are detected from package.json and lockfiles", () => {
  const fixture = makeFixture();
  writePackageJson(fixture.projectDir, {
    name: "project",
    version: "0.1.0",
    packageManager: "pnpm@9.0.0",
    scripts: {
      lint: "eslint .",
      typecheck: "tsc --noEmit",
    },
  });
  writeFileSync(path.join(fixture.projectDir, "tsconfig.json"), "{ }\n");
  writeFileSync(path.join(fixture.projectDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeToolLogger(fixture.binDir, "pnpm", path.join(fixture.dir, "pm.log"));

  const previousPath = process.env.PATH;
  process.env.PATH = fixture.binDir;
  try {
    assert.equal(packageManagerForProject(fixture.projectDir), "pnpm");
    assert.equal(hasPackageScript(fixture.projectDir, "lint"), true);
    assert.equal(hasPackageScript(fixture.projectDir, "test"), false);
    assert.equal(hasTypeScriptConfig(fixture.projectDir), true);
    const resolved = resolvePackageScript("typecheck", fixture.projectDir);
    assert.ok(resolved);
    assert.equal(resolved.name, "pnpm run typecheck");
    assert.deepEqual(resolved.args, ["run", "typecheck"]);
  } finally {
    process.env.PATH = previousPath;
  }
});

test("resolvePackageScript uses manager-specific invocation semantics for yarn and bun", () => {
  const fixture = makeFixture();
  writePackageJson(fixture.projectDir, {
    name: "project",
    version: "0.1.0",
    packageManager: "yarn@4.0.0",
    scripts: {
      lint: "eslint .",
    },
  });
  writePackageJson(fixture.nestedProjectDir, {
    name: "nested",
    version: "0.1.0",
    scripts: {
      test: "vitest run",
    },
  });
  writeFileSync(path.join(fixture.nestedProjectDir, "bun.lock"), "");
  writeToolLogger(fixture.binDir, "yarn", path.join(fixture.dir, "yarn.log"));
  writeToolLogger(fixture.binDir, "bun", path.join(fixture.dir, "bun.log"));

  const previousPath = process.env.PATH;
  process.env.PATH = fixture.binDir;
  try {
    const yarnResolved = resolvePackageScript("lint", fixture.projectDir);
    assert.ok(yarnResolved);
    assert.equal(yarnResolved.name, "yarn lint");
    assert.deepEqual(yarnResolved.args, ["lint"]);

    const bunResolved = resolvePackageScript("test", fixture.nestedProjectDir);
    assert.ok(bunResolved);
    assert.equal(bunResolved.name, "bun run test");
    assert.deepEqual(bunResolved.args, ["run", "test"]);
  } finally {
    process.env.PATH = previousPath;
  }
});

test("tsConfigError accepts JSONC-style tsconfig and reports malformed root configs", () => {
  const fixture = makeFixture();
  writeFileSync(
    path.join(fixture.projectDir, "tsconfig.json"),
    '{\n  // comment\n  "compilerOptions": {\n    "strict": true,\n  },\n}\n',
  );
  writeFileSync(path.join(fixture.nestedProjectDir, "jsconfig.json"), "{\n");

  assert.equal(tsConfigError(fixture.projectDir), null);
  assert.match(tsConfigError(fixture.nestedProjectDir), /invalid jsconfig\.json:/);
});
