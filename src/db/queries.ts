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
 *
 * Memoized per D1Database binding: within a single Worker isolate, `env.DB`
 * is the same object reference for every request, so this WeakMap ensures
 * `d1Adapter` returns the SAME `Db` object for the same binding. That makes
 * the `distinctCache` (keyed by `Db`) stable across requests in production —
 * satisfying F9 (cached per isolate; lifetime = isolate's lifetime).
 *
 * The WeakMap holds no strong reference to the binding, so entries are
 * released when D1Database objects are GC'd (e.g. between isolate restarts).
 */
const d1AdapterCache = new WeakMap<D1Database, Db>();

export function d1Adapter(d1: D1Database): Db {
  // WeakMap requires an object key. Guard against misconfigured envs (missing
  // DB binding → undefined) so resolveDb itself doesn't throw — the error
  // surfaces at prepare() time, matching the pre-existing contract.
  if (d1 !== null && typeof d1 === "object") {
    const cached = d1AdapterCache.get(d1);
    if (cached !== undefined) return cached;

    const adapter: Db = {
      prepare(sql: string): Stmt {
        return wrapD1Stmt(d1.prepare(sql));
      },
    };

    d1AdapterCache.set(d1, adapter);
    return adapter;
  }

  // Degenerate path: d1 is null/undefined (misconfigured deploy). Return an
  // adapter whose prepare() throws immediately, preserving the existing
  // contract that resolveDb itself is lazy.
  return {
    prepare(_sql: string): Stmt {
      throw new TypeError(
        `d1Adapter: env.DB is not a D1Database (got ${String(d1)})`,
      );
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

/** The three columns by which activities may be grouped (and distinct values may be listed). */
export type AggregateGroupBy = "team" | "target" | "spass_type";

/** Alias: the same three columns are valid for list_distinct. */
export type DistinctField = AggregateGroupBy;

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

// ---------------------------------------------------------------------------
// Timeline query
// ---------------------------------------------------------------------------

/** One bucket in a timeline result. */
export interface TimelineBucket {
  readonly bucket: string;
  readonly count: number;
}

/** Bucket granularity for the timeline tool. */
export type TimelineBucketSize = "year" | "month";

/** Inputs for the timeline query function. */
export interface TimelineOptions {
  readonly from: string;
  readonly to: string;
  readonly bucket: TimelineBucketSize;
  readonly team?: string;
  readonly target?: string;
}

/**
 * Generate the complete ordered series of bucket labels from `from` to `to`
 * (exclusive) at the given granularity.
 *
 * Year labels: "YYYY"
 * Month labels: "YYYY-MM"
 *
 * The range is [from, to): the bucket that contains `to` is NOT included.
 */
function generateBucketSeries(
  from: string,
  to: string,
  bucketSize: TimelineBucketSize,
): string[] {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const labels: string[] = [];

  if (bucketSize === "year") {
    const fromYear = fromDate.getUTCFullYear();
    const toYear = toDate.getUTCFullYear();
    // Include year Y iff its bucket start is strictly before toDate — the same
    // rule the month branch uses. When to=2018-01-01T00:00:00Z exactly, the
    // 2018 bucket starts at to so 2018 is excluded; lastYear collapses to 2017.
    const lastYear =
      Date.UTC(toYear, 0, 1) < toDate.getTime() ? toYear : toYear - 1;
    for (let y = fromYear; y <= lastYear; y++) {
      labels.push(String(y));
    }
  } else {
    // month
    let year = fromDate.getUTCFullYear();
    let month = fromDate.getUTCMonth(); // 0-based
    while (true) {
      const bucketStart = Date.UTC(year, month, 1);
      if (bucketStart >= toDate.getTime()) break;
      const mm = String(month + 1).padStart(2, "0");
      labels.push(`${year}-${mm}`);
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
    }
  }

  return labels;
}

/**
 * SQL column expression for grouping by bucket granularity.
 *
 * `start_iso` is stored as "YYYY-MM-DD..." so substr is safe and avoids
 * any date-function portability concerns. The expressions are literals —
 * never derived from user input.
 */
const BUCKET_EXPR = {
  year: "substr(start_iso, 1, 4)",
  month: "substr(start_iso, 1, 7)",
} as const satisfies Record<TimelineBucketSize, string>;

/**
 * Return activity counts bucketed by year or month over [from, to).
 *
 * Security: bucket granularity is resolved from a fixed whitelist
 * (`BUCKET_EXPR`) — never the raw user string. All filter values are bound
 * as positional parameters. The [from, to) range is enforced in SQL via
 * `start_iso >= ?` and `start_iso < ?` (handled by `buildFilters`).
 *
 * Zero-fill: buckets with no matching rows still appear with `count: 0`.
 * The full label series is generated in TS and SQL counts are left-joined.
 */
export async function timeline(
  db: Db,
  options: TimelineOptions,
): Promise<TimelineBucket[]> {
  const { from, to, bucket, team, target } = options;
  const bucketExpr = BUCKET_EXPR[bucket];

  const { clause, params } = buildFilters({ from, to, team, target });

  // `bucketExpr` is a literal from BUCKET_EXPR — never user input.
  const sql = `
    SELECT ${bucketExpr} AS bucket, COUNT(*) AS count
    FROM master_plan
    ${clause}
    GROUP BY ${bucketExpr}
    ORDER BY bucket ASC
  `;

  type SqlRow = { bucket: string; count: number };
  const rows = await db.prepare(sql).bind(...params).all<SqlRow>();

  // Build a lookup from SQL results.
  const countByBucket = new Map<string, number>(
    rows.map((r) => [r.bucket, r.count]),
  );

  // Zero-fill: generate the full series and substitute SQL counts.
  const series = generateBucketSeries(from, to, bucket);
  return series.map((label) => ({
    bucket: label,
    count: countByBucket.get(label) ?? 0,
  }));
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

// ---------------------------------------------------------------------------
// list_distinct query (T12)
// ---------------------------------------------------------------------------

/**
 * Safe lookup from a validated `DistinctField` to the literal SQL column name.
 *
 * Security: the caller's `field` value is already zod-validated as one of the
 * three known enum members, but we NEVER interpolate it raw into SQL. This map
 * guarantees the identifier that reaches the query is a known literal — not the
 * user-supplied string. If `DistinctField` gains a new member without a matching
 * entry here, the `satisfies` below produces a compile-time error.
 */
const DISTINCT_COLUMN = {
  team: "team",
  target: "target",
  spass_type: "spass_type",
} as const satisfies Record<DistinctField, string>;

/**
 * Isolate-level cache for list_distinct results.
 *
 * Keyed by `Db` instance so:
 *   - Same `Db` (same Worker isolate / same test session) → returns cached
 *     results on the second call, issuing NO additional query (F9).
 *   - Different `Db` (different test sessions, different isolates) → get their
 *     own cache entry, preventing cross-test contamination.
 *
 * `WeakMap` is used so cache entries are released when the `Db` object is GC'd
 * — no memory leak in long-running Workers with multiple short-lived Db
 * instances.
 */
const distinctCache = new WeakMap<Db, Map<DistinctField, string[]>>();

/**
 * Return sorted, distinct, non-null values for `field` from master_plan.
 *
 * The column identifier is resolved from `DISTINCT_COLUMN` — never the raw
 * user input. Results are cached per `Db` instance so repeated calls within
 * the same isolate / test session hit the cache rather than issuing a query.
 */
export async function listDistinct(
  db: Db,
  field: DistinctField,
): Promise<string[]> {
  // Check the per-Db cache first.
  let dbCache = distinctCache.get(db);
  if (dbCache !== undefined) {
    const cached = dbCache.get(field);
    if (cached !== undefined) return cached;
  }

  // `col` is a literal from DISTINCT_COLUMN — never the raw user string.
  const col = DISTINCT_COLUMN[field];
  const sql = `
    SELECT DISTINCT ${col} AS value
    FROM master_plan
    WHERE ${col} IS NOT NULL
    ORDER BY ${col} ASC
  `;

  type ValueRow = { value: string };
  const rows = await db.prepare(sql).all<ValueRow>();
  const values = rows.map((r) => r.value);

  // Populate the cache for this Db instance.
  if (dbCache === undefined) {
    dbCache = new Map();
    distinctCache.set(db, dbCache);
  }
  dbCache.set(field, values);

  return values;
}
