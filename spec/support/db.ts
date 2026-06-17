/**
 * In-memory test adapter for the `Db` port.
 *
 * Uses better-sqlite3 (`:memory:`) so specs run real SQL with FTS5 against
 * the production schema — no mocking, no stubs. The synchronous
 * better-sqlite3 API is wrapped in Promise.resolve() to satisfy the async
 * `Db` port that D1 also implements.
 *
 * Imported by spec/support/harness.ts (T05) and spec/db-adapter.spec.ts.
 *
 * CONNECTION LIFECYCLE
 * Each call to createTestDb opens a new better-sqlite3 connection. Callers
 * should call `closeOpenConnections()` in afterAll/afterEach to release native
 * handles promptly. The global afterAll in this module handles cleanup for
 * connections that are never explicitly closed (e.g. in inline spec bodies),
 * but explicit closing is preferred. See `CloseableDb` below.
 */
// better-sqlite3 uses `export =` — must use `import * as` (no esModuleInterop).
import * as BetterSqlite3 from "better-sqlite3";
import type { Db, Stmt } from "../../src/db/queries";
import { SCHEMA_STATEMENTS, REBUILD_FTS } from "../../src/db/schema";
import type { Row } from "./fixtures";
import { afterAll } from "@jest/globals";

// Alias for the instance type produced by `new BetterSqlite3(...)`.
type SqliteDb = BetterSqlite3.Database;

// ---------------------------------------------------------------------------
// Connection registry — tracks every open native handle for this test file
// ---------------------------------------------------------------------------

const openConnections: SqliteDb[] = [];

/**
 * Close all better-sqlite3 connections opened by createTestDb in this file.
 * Call this in afterAll when you want explicit control; the module-level
 * afterAll registered below acts as a safety net.
 */
export function closeOpenConnections(): void {
  let conn: SqliteDb | undefined;
  while ((conn = openConnections.pop()) !== undefined) {
    if (conn.open) conn.close();
  }
}

// Safety-net: close any connections left open by specs that do not call
// closeOpenConnections() explicitly.
afterAll(() => {
  closeOpenConnections();
});

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
// Public types and factory
// ---------------------------------------------------------------------------

/**
 * A `Db` port with a `close()` method for explicit resource management.
 * Prefer calling `close()` in afterAll rather than relying on the module-level
 * safety net, so native handles are released as soon as a describe block ends.
 */
export interface CloseableDb extends Db {
  /** Release the underlying better-sqlite3 connection immediately. */
  close(): void;
}

/**
 * Build a `Db` backed by an in-memory better-sqlite3 database, with the
 * production schema applied and `rows` pre-inserted. FTS is rebuilt once
 * after bulk insert, matching the importer's approach.
 *
 * The returned `CloseableDb` exposes a `close()` method. Callers that do not
 * call `close()` explicitly are cleaned up by the module-level afterAll.
 *
 * @param rows - Fixture rows to seed into `master_plan`.
 */
export function createTestDb(rows: Row[]): CloseableDb {
  // BetterSqlite3 is the constructor when the module uses `export =`.
  const sqlite: SqliteDb = new BetterSqlite3(":memory:");
  openConnections.push(sqlite);

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
    close(): void {
      const idx = openConnections.indexOf(sqlite);
      if (idx !== -1) openConnections.splice(idx, 1);
      if (sqlite.open) sqlite.close();
    },
  };
}
