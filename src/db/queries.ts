/**
 * Db port + D1 production adapter.
 *
 * The `Db` interface is the seam between tool handlers and the database.
 * It is intentionally narrow: the only operation it exposes is `prepare`,
 * which forces all SQL through prepared statements with bound parameters
 * (SPEC N4 — no string concatenation into SQL, ever).
 *
 * D1Database (production) and the in-memory better-sqlite3 adapter
 * (spec/support/db.ts) both satisfy this interface.
 */

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

/** A prepared statement — bound params then execute. */
export interface Stmt {
  /** Bind positional parameters (call before all* / first / run). */
  bind(...values: unknown[]): Stmt;
  /** Execute and return all matching rows. */
  all<T>(): Promise<T[]>;
  /** Execute and return the first row, or null. */
  first<T>(): Promise<T | null>;
  /** Execute with no return value (INSERT / DELETE). */
  run(): Promise<void>;
}

/**
 * The database port every piece of tool-query code depends on.
 * D1Database and the test adapter each implement this slim interface.
 */
export interface Db {
  prepare(sql: string): Stmt;
}

// ---------------------------------------------------------------------------
// Production adapter — wraps env.DB (D1Database)
// ---------------------------------------------------------------------------

/**
 * Wrap a D1PreparedStatement as the `Stmt` port.
 *
 * `bind()` calls the real statement's `.bind()` and wraps the result, so
 * chaining `.bind().bind()` is safe — each call works against the already-
 * bound D1 statement rather than rebuilding from scratch.
 */
function wrapD1Stmt(d1Stmt: D1PreparedStatement): Stmt {
  return {
    bind(...values: unknown[]): Stmt {
      return wrapD1Stmt(d1Stmt.bind(...values));
    },
    async all<T>(): Promise<T[]> {
      return (await d1Stmt.all<T>()).results;
    },
    async first<T>(): Promise<T | null> {
      return d1Stmt.first<T>();
    },
    async run(): Promise<void> {
      await d1Stmt.run();
    },
  };
}

/**
 * Wrap a Cloudflare D1Database as the `Db` port.
 *
 * D1's `.all<T>()` returns `{ results: T[] }` — we unwrap it so callers
 * just get the rows. `.first<T>()` is forwarded directly (returns T | null).
 * `.run()` executes and discards metadata.
 */
export function d1Adapter(d1: D1Database): Db {
  return {
    prepare(sql: string): Stmt {
      return wrapD1Stmt(d1.prepare(sql));
    },
  };
}

// ---------------------------------------------------------------------------
// Tool query functions live below this line (added in T06–T12).
// ---------------------------------------------------------------------------
