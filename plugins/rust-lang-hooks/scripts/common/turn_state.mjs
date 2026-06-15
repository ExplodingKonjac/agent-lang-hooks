import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_NAME = "rust-lang-hooks.sqlite3";
const META_TABLE = "hook_state_meta";
const LAST_PRUNED_KEY = "last_pruned_at";
const DEFAULT_RETENTION_HOURS = 24;
const DEFAULT_MAX_TURNS = 1000;
const DEFAULT_PRUNE_INTERVAL_MINUTES = 60;

function envPositiveInt(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function databasePath(pluginData = process.env.PLUGIN_DATA) {
  if (typeof pluginData !== "string" || pluginData.length === 0) {
    return null;
  }

  return path.join(pluginData, DB_NAME);
}

function openDatabase() {
  const dbPath = databasePath();
  if (!dbPath) {
    return null;
  }

  try {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS turn_file_changes (
        turn_id TEXT PRIMARY KEY,
        rust_changed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS turn_cargo_projects (
        turn_id TEXT NOT NULL,
        project_dir TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (turn_id, project_dir)
      );

      CREATE TABLE IF NOT EXISTS ${META_TABLE} (
        meta_key TEXT PRIMARY KEY,
        meta_value TEXT NOT NULL
      );
    `);
    return db;
  } catch {
    return null;
  }
}

function staleTurnIds(db, cutoffIso) {
  return db
    .prepare("SELECT turn_id FROM turn_file_changes WHERE updated_at < ?")
    .all(cutoffIso)
    .map((row) => row.turn_id);
}

function overflowTurnIds(db, maxTurns) {
  return db
    .prepare(`
      SELECT turn_id
      FROM turn_file_changes
      WHERE turn_id NOT IN (
        SELECT turn_id
        FROM turn_file_changes
        ORDER BY updated_at DESC, turn_id DESC
        LIMIT ?
      )
    `)
    .all(maxTurns)
    .map((row) => row.turn_id);
}

function shouldPrune(db, nowMs, pruneIntervalMinutes) {
  const row = db
    .prepare(`SELECT meta_value FROM ${META_TABLE} WHERE meta_key = ? LIMIT 1`)
    .get(LAST_PRUNED_KEY);
  if (!row) {
    return true;
  }

  const lastPrunedMs = Date.parse(row.meta_value);
  if (!Number.isFinite(lastPrunedMs)) {
    return true;
  }

  return nowMs - lastPrunedMs >= pruneIntervalMinutes * 60 * 1000;
}

function deleteTurns(db, turnIds) {
  if (turnIds.length === 0) {
    return;
  }

  const placeholders = turnIds.map(() => "?").join(", ");
  db.prepare(
    `DELETE FROM turn_cargo_projects WHERE turn_id IN (${placeholders})`,
  ).run(...turnIds);
  db.prepare(
    `DELETE FROM turn_file_changes WHERE turn_id IN (${placeholders})`,
  ).run(...turnIds);
}

function maybePruneState(db, nowIso) {
  const nowMs = Date.parse(nowIso);
  const pruneIntervalMinutes = envPositiveInt(
    "RUST_HOOKS_STATE_PRUNE_INTERVAL_MINUTES",
    DEFAULT_PRUNE_INTERVAL_MINUTES,
  );
  if (!shouldPrune(db, nowMs, pruneIntervalMinutes)) {
    return;
  }

  const retentionHours = envPositiveInt(
    "RUST_HOOKS_STATE_RETENTION_HOURS",
    DEFAULT_RETENTION_HOURS,
  );
  const maxTurns = envPositiveInt(
    "RUST_HOOKS_STATE_MAX_TURNS",
    DEFAULT_MAX_TURNS,
  );
  const cutoffIso = new Date(nowMs - retentionHours * 60 * 60 * 1000).toISOString();
  const turnIds = Array.from(
    new Set([
      ...staleTurnIds(db, cutoffIso),
      ...overflowTurnIds(db, maxTurns),
    ]),
  );

  deleteTurns(db, turnIds);
  db.prepare(`
    INSERT INTO ${META_TABLE} (meta_key, meta_value)
    VALUES (?, ?)
    ON CONFLICT(meta_key) DO UPDATE SET
      meta_value = excluded.meta_value
  `).run(LAST_PRUNED_KEY, nowIso);
}

export function markRustChanged(turnId, cargoProjectDirs = []) {
  if (typeof turnId !== "string" || turnId.length === 0) {
    return false;
  }

  const db = openDatabase();
  if (!db) {
    return false;
  }

  const updatedAt = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO turn_file_changes (turn_id, rust_changed, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(turn_id) DO UPDATE SET
        rust_changed = 1,
        updated_at = excluded.updated_at
    `).run(turnId, updatedAt);

    const insertProject = db.prepare(`
      INSERT INTO turn_cargo_projects (turn_id, project_dir, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(turn_id, project_dir) DO UPDATE SET
        updated_at = excluded.updated_at
    `);
    for (const projectDir of cargoProjectDirs) {
      insertProject.run(turnId, projectDir, updatedAt);
    }

    try {
      maybePruneState(db, updatedAt);
    } catch {}

    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

export function getRustTurnState(turnId) {
  if (typeof turnId !== "string" || turnId.length === 0) {
    return null;
  }

  const db = openDatabase();
  if (!db) {
    return null;
  }

  try {
    const row = db
      .prepare(
        "SELECT rust_changed FROM turn_file_changes WHERE turn_id = ? LIMIT 1",
      )
      .get(turnId);
    if (!row) {
      return { rustChanged: false, cargoProjectDirs: [] };
    }

    const cargoProjectDirs = db
      .prepare(
        "SELECT project_dir FROM turn_cargo_projects WHERE turn_id = ? ORDER BY project_dir",
      )
      .all(turnId)
      .map((projectRow) => projectRow.project_dir);
    return {
      rustChanged: Boolean(row.rust_changed),
      cargoProjectDirs,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}
