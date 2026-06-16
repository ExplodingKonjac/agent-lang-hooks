import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { readOrderedColumn } from "./shared/sqlite.mjs";
import { ROOT } from "./shared/runtime.mjs";
import {
  LanguageHookPlugin,
} from "../plugins/python-lang-hooks/opencode/plugin.mjs";
import {
  makeFixture,
  path as fixturePath,
  readLines,
  writeToolLogger,
} from "./python-lang-hooks/helpers.mjs";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

async function withEnv(overrides, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("plugin generator emits Codex, Claude, and OpenCode artifacts idempotently", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "cross-tool-marketplace-"));
  const repoDir = path.join(tempDir, "repo");
  cpSync(ROOT, repoDir, { recursive: true });

  const generator = path.join(repoDir, "scripts/create_language_hook_plugin.py");
  const args = [generator, "CI Smoke Hooks", "--non-interactive"];
  const first = spawnSync("python3", args, { cwd: repoDir, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);

  const pluginRoot = path.join(repoDir, "plugins/ci-smoke-hooks");
  assert.equal(existsSync(path.join(pluginRoot, ".codex-plugin/plugin.json")), true);
  assert.equal(existsSync(path.join(pluginRoot, ".claude-plugin/plugin.json")), true);
  assert.equal(existsSync(path.join(pluginRoot, "opencode/plugin.mjs")), true);

  const codexMarketplace = readJson(
    path.join(repoDir, ".agents/plugins/marketplace.json"),
  );
  const claudeMarketplace = readJson(
    path.join(repoDir, ".claude-plugin/marketplace.json"),
  );
  assert.equal(
    codexMarketplace.plugins.filter((entry) => entry.name === "ci-smoke-hooks").length,
    1,
  );
  assert.equal(
    claudeMarketplace.plugins.filter((entry) => entry.name === "ci-smoke-hooks")
      .length,
    1,
  );

  rmSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true, force: true });
  rmSync(path.join(pluginRoot, "opencode"), { recursive: true, force: true });
  rmSync(path.join(pluginRoot, "scripts/common/opencode_adapter.mjs"), {
    force: true,
  });

  const second = spawnSync("python3", args, { cwd: repoDir, encoding: "utf8" });
  assert.equal(second.status, 0, second.stderr);

  assert.equal(existsSync(path.join(pluginRoot, ".claude-plugin/plugin.json")), true);
  assert.equal(existsSync(path.join(pluginRoot, "opencode/plugin.mjs")), true);
  assert.equal(
    existsSync(path.join(pluginRoot, "scripts/common/opencode_adapter.mjs")),
    true,
  );

  const codexMarketplaceAfter = readJson(
    path.join(repoDir, ".agents/plugins/marketplace.json"),
  );
  const claudeMarketplaceAfter = readJson(
    path.join(repoDir, ".claude-plugin/marketplace.json"),
  );
  assert.equal(
    codexMarketplaceAfter.plugins.filter((entry) => entry.name === "ci-smoke-hooks")
      .length,
    1,
  );
  assert.equal(
    claudeMarketplaceAfter.plugins.filter((entry) => entry.name === "ci-smoke-hooks")
      .length,
    1,
  );
});

test("OpenCode adapter ignores non-edit tools and runs stop checks once per idle turn", async () => {
  const fixture = makeFixture();
  const modulePath = fixturePath.join(fixture.projectDir, "pkg/module.py");
  const toolLog = fixturePath.join(fixture.dir, "mypy.log");
  const dbPath = fixturePath.join(fixture.pluginData, "python-lang-hooks.sqlite3");
  writeToolLogger(fixture.binDir, "mypy", toolLog, { exitStatus: 1 });

  const logs = [];
  const plugin = await withEnv(
    {
      CODEX_LANG_HOOKS_NODE_PATH: process.execPath,
      PLUGIN_DATA: fixture.pluginData,
      PYTHON_HOOKS_FORMAT: "0",
      PYTHON_HOOKS_LINT: "0",
      PYTHON_HOOKS_TEST: "0",
      PYTHON_HOOKS_TYPECHECK: "1",
      PATH: fixture.binDir,
    },
    async () =>
      LanguageHookPlugin({
        client: {
          app: {
            log: async (entry) => {
              logs.push(entry);
            },
          },
        },
        directory: fixture.projectDir,
        worktree: fixture.projectDir,
        project: {},
      }),
  );

  await withEnv(
    {
      CODEX_LANG_HOOKS_NODE_PATH: process.execPath,
      PLUGIN_DATA: fixture.pluginData,
      PYTHON_HOOKS_FORMAT: "0",
      PYTHON_HOOKS_LINT: "0",
      PYTHON_HOOKS_TEST: "0",
      PYTHON_HOOKS_TYPECHECK: "1",
      PATH: fixture.binDir,
    },
    async () => {
      await plugin["tool.execute.after"](
        {
          tool: "read",
          args: { filePath: modulePath },
          sessionId: "session-a",
        },
        {},
      );
      assert.equal(existsSync(dbPath), false);

      await plugin["tool.execute.after"](
        {
          tool: "write",
          args: { filePath: modulePath },
          sessionId: "session-a",
        },
        {},
      );

      assert.deepEqual(
        readOrderedColumn(
          dbPath,
          "SELECT turn_id FROM turn_file_changes ORDER BY turn_id",
          "turn_id",
        ),
        ["opencode:session-a:1"],
      );

      await plugin.event({
        event: {
          type: "session.idle",
          sessionId: "session-a",
          cwd: fixture.projectDir,
        },
      });
      await plugin.event({
        event: {
          type: "session.idle",
          sessionId: "session-a",
          cwd: fixture.projectDir,
        },
      });
    },
  );

  assert.equal(readLines(toolLog).length, 1);
  assert.equal(logs.length, 1);
  assert.match(logs[0].body.message, /mypy/);
});
