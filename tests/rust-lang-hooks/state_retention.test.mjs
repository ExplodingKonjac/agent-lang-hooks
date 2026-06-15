import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { markRustChanged } from "../../plugins/rust-lang-hooks/scripts/common/turn_state.mjs";
import { makeFixture, path, readCargoProjects, readRustChanged } from "./helpers.mjs";

const DB_NAME = "rust-lang-hooks.sqlite3";

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
    db.prepare("UPDATE turn_cargo_projects SET updated_at = ? WHERE turn_id = ?").run(iso, turnId);
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

test("Rust state TTL pruning removes stale parent and child rows", () => {
  const fixture = makeFixture();
  const staleIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const oldPruneIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      RUST_HOOKS_STATE_RETENTION_HOURS: "24",
      RUST_HOOKS_STATE_MAX_TURNS: "1000",
      RUST_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "1",
    },
    () => {
      assert.equal(markRustChanged("stale-turn", [fixture.projectDir]), true);
      setTurnTimestamp(fixture.pluginData, "stale-turn", staleIso);
      setLastPrunedAt(fixture.pluginData, oldPruneIso);

      assert.equal(markRustChanged("fresh-turn", [fixture.nestedProjectDir]), true);
    },
  );

  assert.equal(readRustChanged(fixture.pluginData, "stale-turn"), null);
  assert.deepEqual(readCargoProjects(fixture.pluginData, "stale-turn"), []);
  assert.equal(readRustChanged(fixture.pluginData, "fresh-turn"), 1);
});

test("Rust state row-cap pruning keeps only the newest configured turns", () => {
  const fixture = makeFixture();
  const oldPruneIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      RUST_HOOKS_STATE_RETENTION_HOURS: "240",
      RUST_HOOKS_STATE_MAX_TURNS: "3",
      RUST_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "1",
    },
    () => {
      for (const turnId of ["turn-1", "turn-2", "turn-3", "turn-4"]) {
        assert.equal(markRustChanged(turnId, [fixture.projectDir]), true);
      }
      setLastPrunedAt(fixture.pluginData, oldPruneIso);

      assert.equal(markRustChanged("turn-5", [fixture.nestedProjectDir]), true);
    },
  );

  assert.deepEqual(readTurnIds(fixture.pluginData), ["turn-5", "turn-4", "turn-3"]);
  assert.deepEqual(readCargoProjects(fixture.pluginData, "turn-1"), []);
  assert.deepEqual(readCargoProjects(fixture.pluginData, "turn-2"), []);
});

test("Rust state skips pruning until the prune interval elapses", () => {
  const fixture = makeFixture();
  const staleIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      RUST_HOOKS_STATE_RETENTION_HOURS: "24",
      RUST_HOOKS_STATE_MAX_TURNS: "1000",
      RUST_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "60",
    },
    () => {
      assert.equal(markRustChanged("stale-turn", [fixture.projectDir]), true);
      setTurnTimestamp(fixture.pluginData, "stale-turn", staleIso);
      setLastPrunedAt(fixture.pluginData, new Date().toISOString());

      assert.equal(markRustChanged("fresh-turn", [fixture.nestedProjectDir]), true);
    },
  );

  assert.equal(readRustChanged(fixture.pluginData, "stale-turn"), 1);
  assert.deepEqual(readCargoProjects(fixture.pluginData, "stale-turn"), [fixture.projectDir]);
});

test("Rust state retention env parsing falls back to defaults for invalid values", () => {
  const fixture = makeFixture();
  const staleIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const oldPruneIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  withEnv(
    {
      PLUGIN_DATA: fixture.pluginData,
      RUST_HOOKS_STATE_RETENTION_HOURS: "nope",
      RUST_HOOKS_STATE_MAX_TURNS: "bad",
      RUST_HOOKS_STATE_PRUNE_INTERVAL_MINUTES: "bad",
    },
    () => {
      assert.equal(markRustChanged("stale-turn", [fixture.projectDir]), true);
      setTurnTimestamp(fixture.pluginData, "stale-turn", staleIso);
      setLastPrunedAt(fixture.pluginData, oldPruneIso);

      assert.equal(markRustChanged("fresh-turn", [fixture.nestedProjectDir]), true);
    },
  );

  assert.equal(readRustChanged(fixture.pluginData, "stale-turn"), null);
  assert.deepEqual(readCargoProjects(fixture.pluginData, "stale-turn"), []);
});
