import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT } from "./shared/runtime.mjs";
import "./cpp-lang-hooks/all.test.mjs";
import "./rust-lang-hooks/all.test.mjs";
import "./python-lang-hooks/all.test.mjs";
import "./js-lang-hooks/all.test.mjs";
import "./cross_tool_marketplace.test.mjs";

test("plugin common hook modules match the template exactly", () => {
  const template = readFileSync(
    path.join(ROOT, "templates/language-hook-template/scripts/common/hook.mjs"),
    "utf8",
  );

  for (const pluginName of [
    "cpp-lang-hooks",
    "rust-lang-hooks",
    "python-lang-hooks",
    "js-lang-hooks",
  ]) {
    const pluginHook = readFileSync(
      path.join(ROOT, `plugins/${pluginName}/scripts/common/hook.mjs`),
      "utf8",
    );
    assert.equal(pluginHook, template, pluginName);
  }
});

test("plugin OpenCode adapter modules match the template exactly", () => {
  const adapterTemplate = readFileSync(
    path.join(
      ROOT,
      "templates/language-hook-template/scripts/common/opencode_adapter.mjs",
    ),
    "utf8",
  );
  const pluginTemplate = readFileSync(
    path.join(ROOT, "templates/language-hook-template/opencode/plugin.mjs"),
    "utf8",
  );

  for (const pluginName of [
    "cpp-lang-hooks",
    "rust-lang-hooks",
    "python-lang-hooks",
    "js-lang-hooks",
  ]) {
    const pluginAdapter = readFileSync(
      path.join(ROOT, `plugins/${pluginName}/scripts/common/opencode_adapter.mjs`),
      "utf8",
    );
    const pluginModule = readFileSync(
      path.join(ROOT, `plugins/${pluginName}/opencode/plugin.mjs`),
      "utf8",
    );
    assert.equal(pluginAdapter, adapterTemplate, `${pluginName}:adapter`);
    assert.equal(pluginModule, pluginTemplate, `${pluginName}:plugin`);
  }
});
