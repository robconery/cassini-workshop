/**
 * Feature: In-memory test adapter satisfies the Db port
 *
 * The `createTestDb` adapter must run real SQL — including FTS5 — against
 * the production schema so later tool specs trust the seam. These specs
 * prove the adapter works; they are T03's green gate.
 */
import { describe, it, expect } from "@jest/globals";
import { createTestDb } from "./support/db";
import { row } from "./support/fixtures";

// ---------------------------------------------------------------------------
// Scenario: Seeded rows are queryable with bound parameters
// ---------------------------------------------------------------------------

describe("createTestDb — happy path", () => {
  it("returns rows matching a bound team parameter", async () => {
    const rows = [
      row({ id: 1, team: "CAPS", title: "CAPS Survey" }),
      row({ id: 2, team: "CIRS", title: "CIRS Nadir" }),
      row({ id: 3, team: "CAPS", title: "CAPS Flyby" }),
    ];
    const db = createTestDb(rows);

    const results = await db
      .prepare("SELECT id, team FROM master_plan WHERE team = ?")
      .bind("CAPS")
      .all<{ id: number; team: string }>();

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.team === "CAPS")).toBe(true);
  });

  it("returns null from first() when no row matches", async () => {
    const db = createTestDb([row({ id: 10, team: "CAPS" })]);

    const result = await db
      .prepare("SELECT id FROM master_plan WHERE team = ?")
      .bind("VIMS")
      .first<{ id: number }>();

    expect(result).toBeNull();
  });

  it("returns the matching row from first() when found", async () => {
    const db = createTestDb([row({ id: 42, team: "ISS" })]);

    const result = await db
      .prepare("SELECT id, team FROM master_plan WHERE id = ?")
      .bind(42)
      .first<{ id: number; team: string }>();

    expect(result).not.toBeNull();
    expect(result?.id).toBe(42);
  });

  // ---------------------------------------------------------------------------
  // Scenario: FTS5 returns a hit for a term present in the seeded rows
  // ---------------------------------------------------------------------------

  it("FTS5 query returns a hit for a term in the seeded title", async () => {
    const db = createTestDb([
      row({ id: 5, title: "Magnetospheric Survey", description: "MAPS survey pass" }),
    ]);

    const hits = await db
      .prepare("SELECT rowid FROM master_plan_fts WHERE master_plan_fts MATCH ?")
      .bind("Magnetospheric")
      .all<{ rowid: number }>();

    expect(hits).toHaveLength(1);
    expect(hits[0]?.rowid).toBe(5);
  });

  it("FTS5 query returns empty array when no rows match the term", async () => {
    const db = createTestDb([
      row({ id: 6, title: "Plasma Wave Science", description: "PWS pass" }),
    ]);

    const hits = await db
      .prepare("SELECT rowid FROM master_plan_fts WHERE master_plan_fts MATCH ?")
      .bind("Magnetospheric")
      .all<{ rowid: number }>();

    expect(hits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario: Malformed SQL throws at preparation / execution time
// ---------------------------------------------------------------------------

describe("createTestDb — sad path", () => {
  it("throws when a malformed SQL string is prepared and executed", async () => {
    const db = createTestDb([row({ id: 1 })]);

    await expect(
      db.prepare("SELECT * FROM nonexistent_table_xyz").all()
    ).rejects.toThrow();
  });
});
