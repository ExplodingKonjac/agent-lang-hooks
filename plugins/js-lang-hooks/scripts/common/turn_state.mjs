import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_NAME = "js-lang-hooks.sqlite3";

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
        js_changed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS turn_js_projects (
        turn_id TEXT NOT NULL,
        project_root TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (turn_id, project_root)
      );

      CREATE TABLE IF NOT EXISTS turn_js_files (
        turn_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (turn_id, file_path)
      );
    `);
    return db;
  } catch {
    return null;
  }
}

export function markJsChanged(turnId, projectRoots = [], lintFiles = []) {
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
      INSERT INTO turn_file_changes (turn_id, js_changed, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(turn_id) DO UPDATE SET
        js_changed = 1,
        updated_at = excluded.updated_at
    `).run(turnId, updatedAt);

    const insertProject = db.prepare(`
      INSERT INTO turn_js_projects (turn_id, project_root, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(turn_id, project_root) DO UPDATE SET
        updated_at = excluded.updated_at
    `);
    for (const projectRoot of projectRoots) {
      insertProject.run(turnId, projectRoot, updatedAt);
    }

    const insertFile = db.prepare(`
      INSERT INTO turn_js_files (turn_id, file_path, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(turn_id, file_path) DO UPDATE SET
        updated_at = excluded.updated_at
    `);
    for (const filePath of lintFiles) {
      insertFile.run(turnId, filePath, updatedAt);
    }

    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

export function getJsTurnState(turnId) {
  if (typeof turnId !== "string" || turnId.length === 0) {
    return null;
  }

  const db = openDatabase();
  if (!db) {
    return null;
  }

  try {
    const row = db
      .prepare("SELECT js_changed FROM turn_file_changes WHERE turn_id = ? LIMIT 1")
      .get(turnId);
    if (!row) {
      return { jsChanged: false, projectRoots: [] };
    }

    const projectRoots = db
      .prepare(
        "SELECT project_root FROM turn_js_projects WHERE turn_id = ? ORDER BY project_root",
      )
      .all(turnId)
      .map((projectRow) => projectRow.project_root);

    const lintFiles = db
      .prepare(
        "SELECT file_path FROM turn_js_files WHERE turn_id = ? ORDER BY file_path",
      )
      .all(turnId)
      .map((fileRow) => fileRow.file_path);

    return {
      jsChanged: Boolean(row.js_changed),
      projectRoots,
      lintFiles,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}
