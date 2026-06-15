import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { markCppChanged } from "../../plugins/cpp-lang-hooks/scripts/common/turn_state.mjs";
import { makeFixture, path, readCppChanged } from "./helpers.mjs";

const DB_NAME = "cpp-lang-hooks.sqlite3";

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

test("C++ state prunes stale rows using the retention TTL", () => {
  const fixture = makeFixture();
  const staleIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const oldPruneIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      CPP_HOOKS_STATE_RETENTION_HOURS: "24",
      CPP_HOOKS_STATE_MAX_TURNS: "1000",
      CPP_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "1",
    },
    () => {
      assert.equal(markCppChanged("stale-turn"), true);
      setTurnTimestamp(fixture.pluginData, "stale-turn", staleIso);
      setLastPrunedAt(fixture.pluginData, oldPruneIso);

      assert.equal(markCppChanged("fresh-turn"), true);
    },
  );

  assert.equal(readCppChanged(fixture.pluginData, "stale-turn"), null);
  assert.equal(readCppChanged(fixture.pluginData, "fresh-turn"), 1);
});

test("C++ state row-cap pruning keeps only the newest configured turns", () => {
  const fixture = makeFixture();
  const oldPruneIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      CPP_HOOKS_STATE_RETENTION_HOURS: "240",
      CPP_HOOKS_STATE_MAX_TURNS: "3",
      CPP_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "1",
    },
    () => {
      for (const turnId of ["turn-1", "turn-2", "turn-3", "turn-4"]) {
        assert.equal(markCppChanged(turnId), true);
      }
      setLastPrunedAt(fixture.pluginData, oldPruneIso);

      assert.equal(markCppChanged("turn-5"), true);
    },
  );

  assert.deepEqual(readTurnIds(fixture.pluginData), ["turn-5", "turn-4", "turn-3"]);
});

test("C++ state skips pruning until the prune interval elapses", () => {
  const fixture = makeFixture();
  const staleIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      CPP_HOOKS_STATE_RETENTION_HOURS: "24",
      CPP_HOOKS_STATE_MAX_TURNS: "1000",
      CPP_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "60",
    },
    () => {
      assert.equal(markCppChanged("stale-turn"), true);
      setTurnTimestamp(fixture.pluginData, "stale-turn", staleIso);
      setLastPrunedAt(fixture.pluginData, new Date().toISOString());

      assert.equal(markCppChanged("fresh-turn"), true);
    },
  );

  assert.equal(readCppChanged(fixture.pluginData, "stale-turn"), 1);
  assert.equal(readCppChanged(fixture.pluginData, "fresh-turn"), 1);
});

test("C++ state retention env parsing falls back to defaults for invalid values", () => {
  const fixture = makeFixture();
  const staleIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const oldPruneIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      CPP_HOOKS_STATE_RETENTION_HOURS: "nope",
      CPP_HOOKS_STATE_MAX_TURNS: "still-nope",
      CPP_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "bad",
    },
    () => {
      assert.equal(markCppChanged("stale-turn"), true);
      setTurnTimestamp(fixture.pluginData, "stale-turn", staleIso);
      setLastPrunedAt(fixture.pluginData, oldPruneIso);

      assert.equal(markCppChanged("fresh-turn"), true);
    },
  );

  assert.equal(readCppChanged(fixture.pluginData, "stale-turn"), null);
  assert.equal(readCppChanged(fixture.pluginData, "fresh-turn"), 1);
});
