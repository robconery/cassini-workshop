/**
 * Importer — seed D1 from data/cassini.db
 *
 * Public API consumed by specs:
 *   - ImportStore: the port the importer drives (DDL, source rows, writes, introspection)
 *   - ImportResult: { ok, imported, skipped }
 *   - runImport(store): execute the full import pipeline
 *
 * Production entry point:
 *   main() reads data/cassini.db via better-sqlite3 and writes
 *   data/cassini.d1.sql (schema + INSERTs) for T13 to feed to
 *   `wrangler d1 execute --file`.
 */

import { SCHEMA_STATEMENTS, REBUILD_FTS } from "../src/db/schema";
import { doyToIso } from "../src/util/dates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A row as it exists in the source cassini.db master_plan table.
 * No start_iso — that is derived by the importer.
 */
export interface SourceRow {
  id: number;
  start_time_utc: string;
  duration: string;
  date: string;
  team: string;
  spass_type: string;
  target: string;
  request_name: string;
  library_definition: string;
  title: string;
  description: string;
}

/** A row ready to insert into the destination master_plan table. */
export interface ProcessedRow extends SourceRow {
  start_iso: string;
}

export interface ImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
}

/**
 * Port that runImport drives. Two implementations:
 *   - freshStore()   in spec/support/import-store.ts   (in-memory, for specs)
 *   - productionStore() below (better-sqlite3, for main())
 *
 * The interface keeps runImport free of any concrete database reference.
 */
export interface ImportStore {
  /** Apply the full schema (SCHEMA_STATEMENTS). Must be idempotent. */
  applySchema(): Promise<void>;
  /** Drop and recreate the schema to guarantee idempotency on re-run. */
  resetSchema(): Promise<void>;
  /** Return the source rows to be imported. */
  sourceRows(): Promise<readonly SourceRow[]>;
  /** Insert a single processed row. */
  insert(row: ProcessedRow): Promise<void>;
  /** Run the FTS rebuild statement. */
  rebuildFts(): Promise<void>;

  // Introspection methods asserted by the spec
  tableExists(name: string): Promise<boolean>;
  indexExists(name: string): Promise<boolean>;
  get(id: number): Promise<Record<string, unknown> | undefined>;
  count(): Promise<number>;
}

// ---------------------------------------------------------------------------
// Shared transform — single source of truth used by both runImport and main()
// ---------------------------------------------------------------------------

/**
 * Derive start_iso from start_time_utc.
 * Returns { ok: true, row } on success, { ok: false } on parse failure.
 * Never throws.
 */
export function transformRow(
  source: SourceRow,
): { ok: true; row: ProcessedRow } | { ok: false } {
  try {
    const start_iso = doyToIso(source.start_time_utc);
    return { ok: true, row: { ...source, start_iso } };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Core import pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full import pipeline against the given store.
 *
 * 1. Reset schema (drop + recreate) to guarantee idempotency on re-run.
 * 2. Read source rows from the store.
 * 3. Transform each row (derive start_iso via doyToIso).
 *    - Unparseable rows are skipped and counted; import continues.
 * 4. Insert each processed row.
 * 5. Rebuild FTS.
 * 6. Return ImportResult.
 */
export async function runImport(store: ImportStore): Promise<ImportResult> {
  await store.resetSchema();

  const sources = await store.sourceRows();
  let imported = 0;
  let skipped = 0;

  for (const source of sources) {
    const result = transformRow(source);
    if (!result.ok) {
      console.warn(
        `[import] skipping row id=${source.id} — unparseable start_time_utc: "${source.start_time_utc}"`,
      );
      skipped++;
      continue;
    }
    await store.insert(result.row);
    imported++;
  }

  await store.rebuildFts();

  return { ok: true, imported, skipped };
}

// ---------------------------------------------------------------------------
// Production store — backed by better-sqlite3, used only by main()
// ---------------------------------------------------------------------------

/**
 * Build an ImportStore backed by two better-sqlite3 databases:
 *   - sourceDb: read-only access to data/cassini.db
 *   - destDb:   the in-memory (or file) destination written as D1 SQL
 *
 * This function is only called from main(); specs use freshStore() instead.
 */
function buildProductionStore(
  sourceDb: import("better-sqlite3").Database,
  destDb: import("better-sqlite3").Database,
): ImportStore {
  return {
    async applySchema(): Promise<void> {
      for (const ddl of SCHEMA_STATEMENTS) {
        destDb.exec(ddl);
      }
    },

    async resetSchema(): Promise<void> {
      // Drop in reverse dependency order, then recreate.
      destDb.exec(`DROP TABLE IF EXISTS master_plan_fts`);
      destDb.exec(`DROP INDEX IF EXISTS idx_master_plan_target`);
      destDb.exec(`DROP INDEX IF EXISTS idx_master_plan_team`);
      destDb.exec(`DROP INDEX IF EXISTS idx_master_plan_start_iso`);
      destDb.exec(`DROP TABLE IF EXISTS master_plan`);
      for (const ddl of SCHEMA_STATEMENTS) {
        destDb.exec(ddl);
      }
    },

    async sourceRows(): Promise<readonly SourceRow[]> {
      return sourceDb
        .prepare(`SELECT * FROM master_plan`)
        .all() as SourceRow[];
    },

    async insert(row: ProcessedRow): Promise<void> {
      destDb
        .prepare(
          `INSERT INTO master_plan
            (id, start_time_utc, start_iso, duration, date, team, spass_type,
             target, request_name, library_definition, title, description)
           VALUES
            (@id, @start_time_utc, @start_iso, @duration, @date, @team, @spass_type,
             @target, @request_name, @library_definition, @title, @description)`,
        )
        .run(row);
    },

    async rebuildFts(): Promise<void> {
      destDb.exec(REBUILD_FTS);
    },

    async tableExists(name: string): Promise<boolean> {
      const row = destDb
        .prepare(
          `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`,
        )
        .get(name);
      return row !== undefined;
    },

    async indexExists(name: string): Promise<boolean> {
      const row = destDb
        .prepare(
          `SELECT 1 FROM sqlite_master WHERE type='index' AND name=?`,
        )
        .get(name);
      return row !== undefined;
    },

    async get(id: number): Promise<Record<string, unknown> | undefined> {
      const row = destDb
        .prepare(`SELECT * FROM master_plan WHERE id=?`)
        .get(id) as Record<string, unknown> | undefined;
      return row;
    },

    async count(): Promise<number> {
      const row = destDb
        .prepare(`SELECT COUNT(*) as n FROM master_plan`)
        .get() as { n: number };
      return row.n;
    },
  };
}

// ---------------------------------------------------------------------------
// D1 SQL artifact serialiser
// ---------------------------------------------------------------------------

/**
 * Escape a string value for embedding in a SQL INSERT literal.
 * Only used for the D1 SQL file output — never used to build queries
 * executed against a live database.
 */
function sqlEscape(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Render a ProcessedRow as a single SQL INSERT statement compatible with
 * `wrangler d1 execute --file`.
 */
function rowToInsertSql(row: ProcessedRow): string {
  return (
    `INSERT INTO master_plan` +
    ` (id, start_time_utc, start_iso, duration, date, team, spass_type,` +
    ` target, request_name, library_definition, title, description) VALUES (` +
    [
      row.id,
      sqlEscape(row.start_time_utc),
      sqlEscape(row.start_iso),
      sqlEscape(row.duration),
      sqlEscape(row.date),
      sqlEscape(row.team),
      sqlEscape(row.spass_type),
      sqlEscape(row.target),
      sqlEscape(row.request_name),
      sqlEscape(row.library_definition),
      sqlEscape(row.title),
      sqlEscape(row.description),
    ].join(", ") +
    `);`
  );
}

// ---------------------------------------------------------------------------
// main() — one-shot production import, guarded against accidental import
// ---------------------------------------------------------------------------

/**
 * Read data/cassini.db, run the full import pipeline via runImport(), then
 * serialize the dest DB contents to data/cassini.d1.sql for T13.
 *
 * runImport() is the validated function (tested by spec/seed-d1-from-cassini.spec.ts).
 * main() wires up the production ImportStore and calls it — no duplicate logic.
 *
 * T13 feeds cassini.d1.sql to `wrangler d1 execute --file`.
 */
async function main(): Promise<void> {
  // Dynamic require keeps this file importable under Workers types;
  // better-sqlite3 is a Node/Bun devDependency and never bundled for CF.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require("better-sqlite3") as typeof import("better-sqlite3");
  const fs = await import("fs");
  const path = await import("path");

  // Resolve relative to cwd — the repo root when invoked via
  // `node scripts/import.js` or `npx ts-node scripts/import.ts`.
  const repoRoot = process.cwd();
  const sourcePath = path.join(repoRoot, "data", "cassini.db");
  const destPath = path.join(repoRoot, "data", "cassini.d1.sql");

  console.log(`[import] source: ${sourcePath}`);
  const sourceDb = new BetterSqlite3(sourcePath, { readonly: true });
  // dest is an in-memory DB; we serialize it to SQL text after runImport().
  const destDb = new BetterSqlite3(":memory:");

  const store = buildProductionStore(sourceDb, destDb);

  // runImport is the spec-validated pipeline: reset schema, transform rows,
  // insert processed rows, rebuild FTS.
  const result = await runImport(store);
  console.log(`[import] done — imported: ${result.imported}, skipped: ${result.skipped}`);

  // Serialize dest DB to a D1-loadable SQL file.
  const lines: string[] = [];

  for (const ddl of SCHEMA_STATEMENTS) {
    lines.push(ddl.trim() + ";");
  }
  lines.push("");

  const rows = destDb
    .prepare(`SELECT * FROM master_plan ORDER BY id`)
    .all() as ProcessedRow[];

  for (const row of rows) {
    lines.push(rowToInsertSql(row));
  }

  lines.push("");
  lines.push(REBUILD_FTS + ";");

  fs.writeFileSync(destPath, lines.join("\n"), "utf8");
  console.log(`[import] wrote: ${destPath}`);

  sourceDb.close();
  destDb.close();
}

// Guard: only run when invoked directly (ts-node / bun run scripts/import.ts).
// In CommonJS/Jest context `require.main === module` is the idiom; under ESM
// with ts-jest or tsc the cleanest guard is checking the filename against argv.
if (
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("import.ts") || process.argv[1].endsWith("import.js"))
) {
  main().catch((err: unknown) => {
    console.error("[import] fatal:", err);
    process.exit(1);
  });
}
