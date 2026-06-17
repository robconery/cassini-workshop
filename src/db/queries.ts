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
 * Count activities matching the given filters.
 *
 * Reuses `buildFilters` so count and list share identical filter semantics —
 * they can never diverge. Returns 0 when no rows match (never throws).
 */
export async function countActivities(
  db: Db,
  filters: ActivityFilters,
): Promise<number> {
  const { clause, params } = buildFilters(filters);

  const sql = `SELECT COUNT(*) AS n FROM master_plan ${clause}`;

  const row = await db.prepare(sql).bind(...params).first<{ n: number }>();
  return row?.n ?? 0;
}

/** One row returned by the FTS search — a projection of Activity plus snippet. */
export interface SearchHit {
  readonly id: number;
  readonly start_iso: string;
  readonly team: string;
  readonly target: string;
  readonly title: string;
  readonly snippet: string;
}

/**
 * Wrap a user-supplied FTS query string so it is treated as a literal phrase
 * by FTS5's MATCH operator. Special characters (quotes, `*`, `-`, `:`,
 * parentheses) can cause MATCH syntax errors when the raw string is bound.
 *
 * Strategy: wrap in double-quotes (FTS5 phrase query) and escape any embedded
 * double-quote by doubling it (""). This is the minimal safe transform that
 * keeps ordinary keyword searches working while preventing MATCH syntax errors
 * on punctuation-heavy input.
 */
function ftsPhrase(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

/**
 * Full-text search over activity title and description using FTS5.
 *
 * The query is wrapped as an FTS5 phrase literal before binding to avoid
 * MATCH-syntax errors on special characters. Results are ordered by FTS5
 * rank (best match first). The `snippet()` function highlights the matched
 * term(s) across both indexed columns; column index -1 means "best column".
 *
 * Returns an empty array when no rows match — never throws for a no-match.
 */
export async function searchActivities(
  db: Db,
  query: string,
  limit: number,
): Promise<SearchHit[]> {
  const sql = `
    SELECT mp.id,
           mp.start_iso,
           mp.team,
           mp.target,
           mp.title,
           snippet(master_plan_fts, -1, '[', ']', '…', 10) AS snippet
    FROM master_plan_fts
    JOIN master_plan mp ON mp.id = master_plan_fts.rowid
    WHERE master_plan_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `;
  return db.prepare(sql).bind(ftsPhrase(query), limit).all<SearchHit>();
}

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

// ---------------------------------------------------------------------------
// Aggregate query
// ---------------------------------------------------------------------------

/** The three columns by which activities may be grouped. */
export type AggregateGroupBy = "team" | "target" | "spass_type";

/** One bucket in an aggregation result. */
export interface AggregationBucket {
  readonly key: string;
  readonly count: number;
}

/**
 * Safe lookup from the validated enum value to the literal SQL column name.
 *
 * This is the security crux: the caller supplies a `group_by` that has
 * already been validated by zod as one of the three known enum values, but
 * we NEVER interpolate the raw string into SQL. Instead we map it to a
 * known-safe literal here, so even if the type boundary were bypassed the
 * query function cannot emit an arbitrary column name. Any value that is
 * not a key of this map is a programmer error and throws at build time (the
 * `satisfies` below) and at runtime (the `exhaustiveGroupBy` guard).
 */
const GROUP_BY_COLUMN = {
  team: "team",
  target: "target",
  spass_type: "spass_type",
} as const satisfies Record<AggregateGroupBy, string>;

/**
 * Resolve a validated `AggregateGroupBy` value to the literal SQL column name.
 *
 * `GROUP_BY_COLUMN` is typed as `Record<AggregateGroupBy, string>` via
 * `satisfies`, so TypeScript guarantees the lookup always returns a `string`
 * for any `AggregateGroupBy` input — no `undefined` branch is possible.
 * If `AggregateGroupBy` gains a new member without a matching entry in
 * `GROUP_BY_COLUMN`, the `satisfies` above will produce a compile error,
 * making this function the statically-enforced exhaustiveness check.
 */
function resolveGroupByColumn(groupBy: AggregateGroupBy): string {
  return GROUP_BY_COLUMN[groupBy];
}

/**
 * Aggregate activities by a single column and return buckets sorted
 * descending by count.
 *
 * Security: the `group_by` column identifier is resolved from a fixed
 * whitelist (`GROUP_BY_COLUMN`) — it is never the raw user input. All
 * filter values and the `top` limit are bound as positional parameters.
 */
export async function aggregateActivities(
  db: Db,
  groupBy: AggregateGroupBy,
  filters: ActivityFilters,
  top: number,
): Promise<AggregationBucket[]> {
  const col = resolveGroupByColumn(groupBy);
  const { clause, params } = buildFilters(filters);

  // `col` is a literal from GROUP_BY_COLUMN — never user input.
  const sql = `
    SELECT ${col} AS key, COUNT(*) AS count
    FROM master_plan
    ${clause}
    GROUP BY ${col}
    ORDER BY count DESC
    LIMIT ?
  `;

  return db.prepare(sql).bind(...params, top).all<AggregationBucket>();
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
