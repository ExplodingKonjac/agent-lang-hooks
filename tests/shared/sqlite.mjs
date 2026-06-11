import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function readOptionalScalar(dbPath, query, columnName, ...params) {
  if (!existsSync(dbPath)) {
    return null;
  }

  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare(query).get(...params);
    return row ? row[columnName] : null;
  } finally {
    db.close();
  }
}

export function readOrderedColumn(dbPath, query, columnName, ...params) {
  if (!existsSync(dbPath)) {
    return [];
  }

  const db = new DatabaseSync(dbPath);
  try {
    return db.prepare(query).all(...params).map((row) => row[columnName]);
  } finally {
    db.close();
  }
}
