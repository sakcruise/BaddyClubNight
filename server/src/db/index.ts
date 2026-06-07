import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SQLITE_PATH ?? "./data/club.db";

mkdirSync(resolve(dbPath, ".."), { recursive: true });

export const db = new Database(resolve(dbPath));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

// Migrations
try { db.exec("ALTER TABLE sessions ADD COLUMN synced_at TEXT"); } catch { /* column already exists */ }

export default db;
