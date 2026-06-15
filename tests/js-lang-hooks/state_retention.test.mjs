import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { markJsChanged } from "../../plugins/js-lang-hooks/scripts/common/turn_state.mjs";
import {
  makeFixture,
  path,
  readJsChanged,
  readLintFiles,
  readProjectRoots,
} from "./helpers.mjs";

const DB_NAME = "js-lang-hooks.sqlite3";

function withEnv(env, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
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

function dbPath(pluginData) {
  return path.join(pluginData, DB_NAME);
}

function withDb(pluginData, fn) {
  const db = new DatabaseSync(dbPath(pluginData));
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function setTurnTimestamp(pluginData, turnId, iso) {
  withDb(pluginData, (db) => {
    db.prepare("UPDATE turn_file_changes SET updated_at = ? WHERE turn_id = ?").run(iso, turnId);
    db.prepare("UPDATE turn_js_projects SET updated_at = ? WHERE turn_id = ?").run(iso, turnId);
    db.prepare("UPDATE turn_js_files SET updated_at = ? WHERE turn_id = ?").run(iso, turnId);
  });
}

function setLastPrunedAt(pluginData, iso) {
  withDb(pluginData, (db) => {
    db.prepare(`
      INSERT INTO hook_state_meta (meta_key, meta_value)
      VALUES ('last_pruned_at', ?)
      ON CONFLICT(meta_key) DO UPDATE SET
        meta_value = excluded.meta_value
    `).run(iso);
  });
}

function readTurnIds(pluginData) {
  return withDb(pluginData, (db) =>
    db
      .prepare("SELECT turn_id FROM turn_file_changes ORDER BY updated_at DESC, turn_id DESC")
      .all()
      .map((row) => row.turn_id),
  );
}

test("JS state TTL pruning removes stale parent and child rows", () => {
  const fixture = makeFixture();
  const staleIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const oldPruneIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      JS_HOOKS_STATE_RETENTION_HOURS: "24",
      JS_HOOKS_STATE_MAX_TURNS: "1000",
      JS_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "1",
    },
    () => {
      assert.equal(
        markJsChanged(
          "stale-turn",
          [fixture.projectDir],
          [path.join(fixture.projectDir, "src/index.ts")],
        ),
        true,
      );
      setTurnTimestamp(fixture.pluginData, "stale-turn", staleIso);
      setLastPrunedAt(fixture.pluginData, oldPruneIso);

      assert.equal(
        markJsChanged(
          "fresh-turn",
          [fixture.nestedProjectDir],
          [path.join(fixture.nestedProjectDir, "src/nested.ts")],
        ),
        true,
      );
    },
  );

  assert.equal(readJsChanged(fixture.pluginData, "stale-turn"), null);
  assert.deepEqual(readProjectRoots(fixture.pluginData, "stale-turn"), []);
  assert.deepEqual(readLintFiles(fixture.pluginData, "stale-turn"), []);
  assert.equal(readJsChanged(fixture.pluginData, "fresh-turn"), 1);
});

test("JS state row-cap pruning keeps only the newest configured turns", () => {
  const fixture = makeFixture();
  const oldPruneIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      JS_HOOKS_STATE_RETENTION_HOURS: "240",
      JS_HOOKS_STATE_MAX_TURNS: "3",
      JS_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "1",
    },
    () => {
      for (const turnId of ["turn-1", "turn-2", "turn-3", "turn-4"]) {
        assert.equal(
          markJsChanged(turnId, [fixture.projectDir], [path.join(fixture.projectDir, "src/index.ts")]),
          true,
        );
      }
      setLastPrunedAt(fixture.pluginData, oldPruneIso);

      assert.equal(
        markJsChanged(
          "turn-5",
          [fixture.nestedProjectDir],
          [path.join(fixture.nestedProjectDir, "src/nested.ts")],
        ),
        true,
      );
    },
  );

  assert.deepEqual(readTurnIds(fixture.pluginData), ["turn-5", "turn-4", "turn-3"]);
  assert.deepEqual(readProjectRoots(fixture.pluginData, "turn-1"), []);
  assert.deepEqual(readLintFiles(fixture.pluginData, "turn-2"), []);
});

test("JS state skips pruning until the prune interval elapses", () => {
  const fixture = makeFixture();
  const staleIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const staleFile = path.join(fixture.projectDir, "src/index.ts");

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      JS_HOOKS_STATE_RETENTION_HOURS: "24",
      JS_HOOKS_STATE_MAX_TURNS: "1000",
      JS_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "60",
    },
    () => {
      assert.equal(markJsChanged("stale-turn", [fixture.projectDir], [staleFile]), true);
      setTurnTimestamp(fixture.pluginData, "stale-turn", staleIso);
      setLastPrunedAt(fixture.pluginData, new Date().toISOString());

      assert.equal(
        markJsChanged(
          "fresh-turn",
          [fixture.nestedProjectDir],
          [path.join(fixture.nestedProjectDir, "src/nested.ts")],
        ),
        true,
      );
    },
  );

  assert.equal(readJsChanged(fixture.pluginData, "stale-turn"), 1);
  assert.deepEqual(readProjectRoots(fixture.pluginData, "stale-turn"), [fixture.projectDir]);
  assert.deepEqual(readLintFiles(fixture.pluginData, "stale-turn"), [staleFile]);
});

test("JS state retention env parsing falls back to defaults for invalid values", () => {
  const fixture = makeFixture();
  const staleIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const oldPruneIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      JS_HOOKS_STATE_RETENTION_HOURS: "nope",
      JS_HOOKS_STATE_MAX_TURNS: "bad",
      JS_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "bad",
    },
    () => {
      assert.equal(
        markJsChanged(
          "stale-turn",
          [fixture.projectDir],
          [path.join(fixture.projectDir, "src/index.ts")],
        ),
        true,
      );
      setTurnTimestamp(fixture.pluginData, "stale-turn", staleIso);
      setLastPrunedAt(fixture.pluginData, oldPruneIso);

      assert.equal(
        markJsChanged(
          "fresh-turn",
          [fixture.nestedProjectDir],
          [path.join(fixture.nestedProjectDir, "src/nested.ts")],
        ),
        true,
      );
    },
  );

  assert.equal(readJsChanged(fixture.pluginData, "stale-turn"), null);
  assert.deepEqual(readProjectRoots(fixture.pluginData, "stale-turn"), []);
  assert.deepEqual(readLintFiles(fixture.pluginData, "stale-turn"), []);
});
