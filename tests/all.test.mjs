import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT } from "./shared/runtime.mjs";
import "./cpp-lang-hooks/all.test.mjs";
import "./rust-lang-hooks/all.test.mjs";
import "./python-lang-hooks/all.test.mjs";

test("plugin common hook modules match the template exactly", () => {
  const template = readFileSync(
    path.join(ROOT, "templates/language-hook-template/scripts/common/hook.mjs"),
    "utf8",
  );

  for (const pluginName of [
    "cpp-lang-hooks",
    "rust-lang-hooks",
    "python-lang-hooks",
  ]) {
    const pluginHook = readFileSync(
      path.join(ROOT, `plugins/${pluginName}/scripts/common/hook.mjs`),
      "utf8",
    );
    assert.equal(pluginHook, template, pluginName);
  }
});
