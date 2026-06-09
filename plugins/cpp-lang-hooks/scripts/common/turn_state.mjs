import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_NAME = "cpp-lang-hooks.sqlite3";

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
        cpp_changed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `);
    return db;
  } catch {
    return null;
  }
}

export function markCppChanged(turnId) {
  if (typeof turnId !== "string" || turnId.length === 0) {
    return false;
  }

  const db = openDatabase();
  if (!db) {
    return false;
  }

  try {
    db.prepare(`
      INSERT INTO turn_file_changes (turn_id, cpp_changed, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(turn_id) DO UPDATE SET
        cpp_changed = 1,
        updated_at = excluded.updated_at
    `).run(turnId, new Date().toISOString());
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

export function didCppChange(turnId) {
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
        "SELECT cpp_changed FROM turn_file_changes WHERE turn_id = ? LIMIT 1",
      )
      .get(turnId);
    return Boolean(row?.cpp_changed);
  } catch {
    return null;
  } finally {
    db.close();
  }
}
