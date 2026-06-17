/**
 * In-memory test adapter for the `Db` port.
 *
 * Uses better-sqlite3 (`:memory:`) so specs run real SQL with FTS5 against
 * the production schema — no mocking, no stubs. The synchronous
 * better-sqlite3 API is wrapped in Promise.resolve() to satisfy the async
 * `Db` port that D1 also implements.
 *
 * Imported by spec/support/harness.ts (T05) and spec/db-adapter.spec.ts.
 */
// better-sqlite3 uses `export =` — must use `import * as` (no esModuleInterop).
import * as BetterSqlite3 from "better-sqlite3";
import type { Db, Stmt } from "../../src/db/queries";
import { SCHEMA_STATEMENTS, REBUILD_FTS } from "../../src/db/schema";
import type { Row } from "./fixtures";

// Alias for the instance type produced by `new BetterSqlite3(...)`.
type SqliteDb = BetterSqlite3.Database;

// ---------------------------------------------------------------------------
// Adapter internals
// ---------------------------------------------------------------------------

/**
 * Wrap a better-sqlite3 `SqliteDb` (synchronous) as the async `Stmt` port.
 *
 * better-sqlite3 statements are re-bound by passing values at execution time,
 * so `bind()` here captures the values and returns a fresh Stmt-shaped object
 * that applies them on `.all()` / `.first()` / `.run()`.
 */
function wrapStmt(db: SqliteDb, sql: string, boundValues: unknown[] = []): Stmt {
  return {
    bind(...values: unknown[]): Stmt {
      return wrapStmt(db, sql, values);
    },
    all<T>(): Promise<T[]> {
      try {
        const rows = db.prepare(sql).all(...boundValues) as T[];
        return Promise.resolve(rows);
      } catch (err) {
        return Promise.reject(err);
      }
    },
    first<T>(): Promise<T | null> {
      try {
        const row = db.prepare(sql).get(...boundValues) as T | undefined;
        return Promise.resolve(row ?? null);
      } catch (err) {
        return Promise.reject(err);
      }
    },
    run(): Promise<void> {
      try {
        db.prepare(sql).run(...boundValues);
        return Promise.resolve();
      } catch (err) {
        return Promise.reject(err);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Build a `Db` backed by an in-memory better-sqlite3 database, with the
 * production schema applied and `rows` pre-inserted. FTS is rebuilt once
 * after bulk insert, matching the importer's approach.
 *
 * @param rows - Fixture rows to seed into `master_plan`.
 */
export function createTestDb(rows: Row[]): Db {
  // BetterSqlite3 is the constructor when the module uses `export =`.
  const sqlite: SqliteDb = new BetterSqlite3(":memory:");

  // Apply the shared schema — identical to production D1.
  for (const ddl of SCHEMA_STATEMENTS) {
    sqlite.exec(ddl);
  }

  if (rows.length > 0) {
    const insert = sqlite.prepare(`
      INSERT INTO master_plan
        (id, start_time_utc, start_iso, duration, date, team, spass_type,
         target, request_name, library_definition, title, description)
      VALUES
        (@id, @start_time_utc, @start_iso, @duration, @date, @team, @spass_type,
         @target, @request_name, @library_definition, @title, @description)
    `);

    const insertMany = sqlite.transaction((batch: Row[]) => {
      for (const r of batch) {
        insert.run(r);
      }
    });

    insertMany(rows);

    // Rebuild the external-content FTS index now that rows are present.
    sqlite.exec(REBUILD_FTS);
  }

  return {
    prepare(sql: string): Stmt {
      return wrapStmt(sqlite, sql);
    },
  };
}
