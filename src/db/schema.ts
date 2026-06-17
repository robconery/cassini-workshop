/**
 * Shared DDL — single source of truth for the master_plan schema.
 *
 * Both the importer (scripts/import.ts) and the in-memory test adapters
 * (spec/support/db.ts, spec/support/import-store.ts) import from here so
 * production and test always run against identical SQL. Never duplicate this
 * DDL elsewhere.
 */

export const CREATE_MASTER_PLAN = `
CREATE TABLE IF NOT EXISTS master_plan (
  id                 INTEGER PRIMARY KEY,
  start_time_utc     TEXT,
  start_iso          TEXT,
  duration           TEXT,
  date               TEXT,
  team               TEXT,
  spass_type         TEXT,
  target             TEXT,
  request_name       TEXT,
  library_definition TEXT,
  title              TEXT,
  description        TEXT
)`;

export const CREATE_IDX_START_ISO = `
CREATE INDEX IF NOT EXISTS idx_master_plan_start_iso ON master_plan(start_iso)`;

export const CREATE_IDX_TEAM = `
CREATE INDEX IF NOT EXISTS idx_master_plan_team ON master_plan(team)`;

export const CREATE_IDX_TARGET = `
CREATE INDEX IF NOT EXISTS idx_master_plan_target ON master_plan(target)`;

/**
 * FTS5 external-content virtual table. The `content` and `content_rowid`
 * options point FTS at the source table so it does not duplicate text storage.
 * Requires a manual rebuild after bulk insert (see REBUILD_FTS below).
 */
export const CREATE_FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS master_plan_fts USING fts5(
  title, description,
  content='master_plan',
  content_rowid='id'
)`;

/**
 * Rebuild the external-content FTS index from the source table.
 * Run once after bulk-inserting rows; not needed for incremental inserts
 * if you also insert into the FTS table in the same transaction.
 */
export const REBUILD_FTS = `INSERT INTO master_plan_fts(master_plan_fts) VALUES('rebuild')`;

/**
 * Ordered array of DDL statements to apply from scratch.
 * Execute them in sequence; each is idempotent via IF NOT EXISTS.
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  CREATE_MASTER_PLAN,
  CREATE_IDX_START_ISO,
  CREATE_IDX_TEAM,
  CREATE_IDX_TARGET,
  CREATE_FTS,
];
