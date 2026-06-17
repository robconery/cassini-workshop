// STORY-002 — Importer: seed D1 from cassini.db
//
// These specs drive the importer against a fresh in-memory store. The importer
// API is the production export from `scripts/import.ts`; the store is the same
// `Db` port D1 implements. Stub functions below are expected to fail first.
import { describe, it, expect, beforeAll } from "@jest/globals";

// Production exports — built by T04. Importing now keeps the spec red.
import {
  runImport,
  type ImportStore,
  type ImportResult,
} from "../scripts/import";
import { row } from "./support/fixtures";

/** A source-row shape as it exists in cassini.db (no derived start_iso yet). */
type SourceRow = Omit<ReturnType<typeof row>, "start_iso">;

function source(overrides: Partial<SourceRow> = {}): SourceRow {
  const { start_iso: _drop, ...rest } = row(overrides as never);
  return { ...rest, ...overrides } as SourceRow;
}

/** Build a fresh empty in-memory store seeded from these source rows. */
declare function freshStore(sourceRows: SourceRow[]): ImportStore;

describe("Feature: importing the Cassini master plan into D1", () => {
  // -------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------
  describe("Scenario: importing a clean dataset", () => {
    let store: ImportStore;
    let result: ImportResult;

    beforeAll(async () => {
      store = freshStore([
        source({ id: 1, start_time_utc: "2004-135T18:40:00" }),
        source({ id: 2, start_time_utc: "2005-001T00:00:00" }),
      ]);
      result = await runImport(store);
    });

    it("creates the master_plan table", async () => {
      expect(await store.tableExists("master_plan")).toBe(true);
    });

    it("creates the FTS virtual table", async () => {
      expect(await store.tableExists("master_plan_fts")).toBe(true);
    });

    it("creates the start_iso index", async () => {
      expect(await store.indexExists("idx_master_plan_start_iso")).toBe(true);
    });

    it("imports every source row", () => {
      expect(result.imported).toBe(2);
    });

    it("skips no rows", () => {
      expect(result.skipped).toBe(0);
    });
  });

  describe("Scenario: deriving start_iso from the DOY format", () => {
    let store: ImportStore;

    beforeAll(async () => {
      store = freshStore([source({ id: 7, start_time_utc: "2004-135T18:40:00" })]);
      await runImport(store);
    });

    it("converts day-of-year to a calendar ISO timestamp", async () => {
      const imported = await store.get(7);
      expect(imported?.start_iso).toBe("2004-05-14T18:40:00Z");
    });
  });

  describe("Scenario: running the importer twice", () => {
    let store: ImportStore;
    let secondCount: number;

    beforeAll(async () => {
      store = freshStore([source({ id: 1 }), source({ id: 2 })]);
      await runImport(store);
      await runImport(store);
      secondCount = await store.count();
    });

    it("leaves the row count unchanged", () => {
      expect(secondCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------
  // SAD PATH
  // -------------------------------------------------------------------
  describe("Scenario: encountering an unparseable start_time_utc", () => {
    let store: ImportStore;
    let result: ImportResult;

    beforeAll(async () => {
      store = freshStore([
        source({ id: 1, start_time_utc: "2004-135T18:40:00" }),
        source({ id: 2, start_time_utc: "not-a-real-timestamp" }),
      ]);
      result = await runImport(store);
    });

    it("skips the malformed row", () => {
      expect(result.skipped).toBe(1);
    });

    it("still imports the good row", () => {
      expect(result.imported).toBe(1);
    });

    it("does not throw", () => {
      expect(result.ok).toBe(true);
    });
  });
});
