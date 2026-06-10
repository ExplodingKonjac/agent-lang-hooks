import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_NAME = "rust-lang-hooks.sqlite3";

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
    `);
    return db;
  } catch {
    return null;
  }
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
