import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_NAME = "python-lang-hooks.sqlite3";

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
        python_changed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS turn_python_projects (
        turn_id TEXT NOT NULL,
        project_root TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (turn_id, project_root)
      );
    `);
    return db;
  } catch {
    return null;
  }
}

export function markPythonChanged(turnId, projectRoots = []) {
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
      INSERT INTO turn_file_changes (turn_id, python_changed, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(turn_id) DO UPDATE SET
        python_changed = 1,
        updated_at = excluded.updated_at
    `).run(turnId, updatedAt);

    const insertProject = db.prepare(`
      INSERT INTO turn_python_projects (turn_id, project_root, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(turn_id, project_root) DO UPDATE SET
        updated_at = excluded.updated_at
    `);
    for (const projectRoot of projectRoots) {
      insertProject.run(turnId, projectRoot, updatedAt);
    }

    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

export function getPythonTurnState(turnId) {
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
        "SELECT python_changed FROM turn_file_changes WHERE turn_id = ? LIMIT 1",
      )
      .get(turnId);
    if (!row) {
      return { pythonChanged: false, projectRoots: [] };
    }

    const projectRoots = db
      .prepare(
        "SELECT project_root FROM turn_python_projects WHERE turn_id = ? ORDER BY project_root",
      )
      .all(turnId)
      .map((projectRow) => projectRow.project_root);
    return {
      pythonChanged: Boolean(row.python_changed),
      projectRoots,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}
