/**
 * In-memory ImportStore for specs.
 *
 * freshStore(sourceRows) builds a better-sqlite3 :memory: DB whose
 * source rows the importer will read and transform. The destination
 * (post-import) state is visible through the introspection methods
 * (tableExists, indexExists, get, count) that the spec asserts.
 *
 * The same DB instance serves as both the "source" (pre-import rows kept
 * in a separate source_rows staging table) and the "destination"
 * (master_plan after runImport creates the schema and inserts transformed
 * rows). This keeps the store as a single coherent object the spec can
 * build once and inspect after import.
 */
// better-sqlite3 uses `export =` — must use `import * as`.
import * as BetterSqlite3 from "better-sqlite3";
import type { ImportStore, SourceRow, ProcessedRow } from "../../scripts/import";
import { SCHEMA_STATEMENTS, REBUILD_FTS } from "../../src/db/schema";

type SqliteDb = BetterSqlite3.Database;

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Build an ImportStore backed by a fresh in-memory better-sqlite3 DB.
 *
 * sourceRows are stored in a staging table that the store returns from
 * sourceRows(). The importer then calls resetSchema() (creates master_plan
 * etc.), insert() for each processed row, and rebuildFts().
 *
 * @param sourceRows - Rows the importer should process (no start_iso yet).
 */
export function freshStore(sourceRows: readonly SourceRow[]): ImportStore {
  const db: SqliteDb = new BetterSqlite3(":memory:");

  // Staging table: holds the raw source rows so sourceRows() can return them.
  db.exec(`
    CREATE TABLE _import_source (
      id                 INTEGER PRIMARY KEY,
      start_time_utc     TEXT,
      duration           TEXT,
      date               TEXT,
      team               TEXT,
      spass_type         TEXT,
      target             TEXT,
      request_name       TEXT,
      library_definition TEXT,
      title              TEXT,
      description        TEXT
    )
  `);

  if (sourceRows.length > 0) {
    const ins = db.prepare(`
      INSERT INTO _import_source
        (id, start_time_utc, duration, date, team, spass_type, target,
         request_name, library_definition, title, description)
      VALUES
        (@id, @start_time_utc, @duration, @date, @team, @spass_type, @target,
         @request_name, @library_definition, @title, @description)
    `);
    const insertAll = db.transaction((rows: readonly SourceRow[]) => {
      for (const r of rows) {
        ins.run(r);
      }
    });
    insertAll(sourceRows);
  }

  return {
    async applySchema(): Promise<void> {
      for (const ddl of SCHEMA_STATEMENTS) {
        db.exec(ddl);
      }
    },

    async resetSchema(): Promise<void> {
      // Drop destination objects in reverse dependency order, then recreate.
      // The staging table (_import_source) is left untouched.
      db.exec(`DROP TABLE IF EXISTS master_plan_fts`);
      db.exec(`DROP INDEX IF EXISTS idx_master_plan_target`);
      db.exec(`DROP INDEX IF EXISTS idx_master_plan_team`);
      db.exec(`DROP INDEX IF EXISTS idx_master_plan_start_iso`);
      db.exec(`DROP TABLE IF EXISTS master_plan`);
      for (const ddl of SCHEMA_STATEMENTS) {
        db.exec(ddl);
      }
    },

    async sourceRows(): Promise<readonly SourceRow[]> {
      return db.prepare(`SELECT * FROM _import_source`).all() as SourceRow[];
    },

    async insert(row: ProcessedRow): Promise<void> {
      db.prepare(`
        INSERT INTO master_plan
          (id, start_time_utc, start_iso, duration, date, team, spass_type,
           target, request_name, library_definition, title, description)
        VALUES
          (@id, @start_time_utc, @start_iso, @duration, @date, @team, @spass_type,
           @target, @request_name, @library_definition, @title, @description)
      `).run(row);
    },

    async rebuildFts(): Promise<void> {
      db.exec(REBUILD_FTS);
    },

    async tableExists(name: string): Promise<boolean> {
      const r = db
        .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`)
        .get(name);
      return r !== undefined;
    },

    async indexExists(name: string): Promise<boolean> {
      const r = db
        .prepare(`SELECT 1 FROM sqlite_master WHERE type='index' AND name=?`)
        .get(name);
      return r !== undefined;
    },

    async get(id: number): Promise<Record<string, unknown> | undefined> {
      const r = db
        .prepare(`SELECT * FROM master_plan WHERE id=?`)
        .get(id) as Record<string, unknown> | undefined;
      return r;
    },

    async count(): Promise<number> {
      const r = db
        .prepare(`SELECT COUNT(*) as n FROM master_plan`)
        .get() as { n: number };
      return r.n;
    },
  };
}
