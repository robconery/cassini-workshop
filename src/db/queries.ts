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
// Shared types
// ---------------------------------------------------------------------------

/** One row from master_plan — all columns present. */
export interface Activity {
  readonly id: number;
  readonly start_time_utc: string;
  readonly start_iso: string;
  readonly duration: string;
  readonly date: string;
  readonly team: string;
  readonly spass_type: string;
  readonly target: string;
  readonly request_name: string;
  readonly library_definition: string;
  readonly title: string;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Shared filter building (reused by T09 count, T11 timeline)
// ---------------------------------------------------------------------------

/** Optional filter inputs shared across list / count / timeline tools. */
export interface ActivityFilters {
  readonly from?: string;
  readonly to?: string;
  readonly team?: string;
  readonly target?: string;
  readonly spass_type?: string;
}

/**
 * Build the WHERE clause and bound parameter array from a set of optional
 * filters. The clause text is assembled from a fixed whitelist of column
 * names — user values are NEVER interpolated into SQL text; they are always
 * bound via positional `?` placeholders.
 *
 * Returns `{ clause, params }` where `clause` is either an empty string (no
 * filters) or a `WHERE ...` string ready to append to a SELECT, and `params`
 * is the ordered array to pass to `.bind(...params)`.
 */
export function buildFilters(filters: ActivityFilters): {
  clause: string;
  params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.from !== undefined) {
    conditions.push("start_iso >= ?");
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    conditions.push("start_iso < ?");
    params.push(filters.to);
  }
  if (filters.team !== undefined) {
    conditions.push("team = ?");
    params.push(filters.team);
  }
  if (filters.target !== undefined) {
    conditions.push("target = ?");
    params.push(filters.target);
  }
  if (filters.spass_type !== undefined) {
    conditions.push("spass_type = ?");
    params.push(filters.spass_type);
  }

  const clause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return { clause, params };
}

// ---------------------------------------------------------------------------
// Tool query functions live below this line (added in T06–T12).
// ---------------------------------------------------------------------------

/**
 * Fetch a single activity by its primary key.
 *
 * Returns the full row or null if no row with that id exists.
 * The id is bound as a positional parameter — never interpolated into SQL.
 */
export async function getActivity(
  db: Db,
  id: number,
): Promise<Activity | null> {
  const sql = `
    SELECT id, start_time_utc, start_iso, duration, date, team, spass_type,
           target, request_name, library_definition, title, description
    FROM master_plan
    WHERE id = ?
  `;
  return db.prepare(sql).bind(id).first<Activity>();
}

/** Pagination inputs for list_activities. */
export interface ListActivityOptions extends ActivityFilters {
  readonly limit: number;
  readonly offset: number;
}

/**
 * Fetch a page of activities matching the given filters.
 *
 * Ordering is stable (start_iso, id) so pagination produces disjoint pages.
 * All filter values are bound — no string interpolation of user data.
 */
export async function listActivities(
  db: Db,
  options: ListActivityOptions,
): Promise<Activity[]> {
  const { limit, offset, ...filters } = options;
  const { clause, params } = buildFilters(filters);

  const sql = `
    SELECT id, start_time_utc, start_iso, duration, date, team, spass_type,
           target, request_name, library_definition, title, description
    FROM master_plan
    ${clause}
    ORDER BY start_iso, id
    LIMIT ? OFFSET ?
  `;

  return db.prepare(sql).bind(...params, limit, offset).all<Activity>();
}
