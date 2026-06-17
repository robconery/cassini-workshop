// STORY-003 — Tool: list_activities
import { describe, it, expect, beforeAll } from "@jest/globals";
import { sessionWith, McpError } from "./support/harness";
import { row, type Row } from "./support/fixtures";

type Activity = Row;

/** 30 Saturn/CAPS rows in 2010 so default-25 and pagination are observable. */
const dataset: Row[] = Array.from({ length: 30 }, (_, i) =>
  row({
    id: i + 1,
    team: "CAPS",
    target: "Saturn",
    start_iso: `2010-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
  }),
);

describe("Feature: listing activities with filters and pagination", () => {
  // -------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------
  describe("Scenario: calling with no arguments", () => {
    let result: Activity[];

    beforeAll(async () => {
      result = await sessionWith(dataset).callTool<Activity[]>("list_activities", {});
    });

    it("returns the default page size of 25", () => {
      expect(result).toHaveLength(25);
    });

    it("includes the derived ISO timestamp on each row", () => {
      expect(result[0]!.start_iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("includes the raw mission timestamp on each row", () => {
      expect(result[0]!.start_time_utc).toBeDefined();
    });
  });

  describe("Scenario: filtering by date range", () => {
    let result: Activity[];

    beforeAll(async () => {
      const mixed: Row[] = [
        row({ id: 1, start_iso: "2009-06-01T00:00:00Z" }),
        row({ id: 2, start_iso: "2010-06-01T00:00:00Z" }),
        row({ id: 3, start_iso: "2011-06-01T00:00:00Z" }),
      ];
      result = await sessionWith(mixed).callTool<Activity[]>("list_activities", {
        from: "2010-01-01T00:00:00Z",
        to: "2011-01-01T00:00:00Z",
      });
    });

    it("returns only rows inside the range", () => {
      expect(result).toHaveLength(1);
    });

    it("excludes rows outside the range", () => {
      expect(result.every((r) => r.start_iso >= "2010-01-01T00:00:00Z" && r.start_iso < "2011-01-01T00:00:00Z")).toBe(true);
    });
  });

  describe("Scenario: filtering by team", () => {
    let result: Activity[];

    beforeAll(async () => {
      const mixed: Row[] = [
        row({ id: 1, team: "CAPS" }),
        row({ id: 2, team: "CDA" }),
        row({ id: 3, team: "CAPS" }),
      ];
      result = await sessionWith(mixed).callTool<Activity[]>("list_activities", { team: "CAPS" });
    });

    it("returns only the matching team", () => {
      expect(result.every((r) => r.team === "CAPS")).toBe(true);
    });
  });

  describe("Scenario: filtering by target", () => {
    let result: Activity[];

    beforeAll(async () => {
      const mixed: Row[] = [
        row({ id: 1, target: "Titan" }),
        row({ id: 2, target: "Saturn" }),
        row({ id: 3, target: "Titan" }),
      ];
      result = await sessionWith(mixed).callTool<Activity[]>("list_activities", { target: "Titan" });
    });

    it("returns only the matching target", () => {
      expect(result.every((r) => r.target === "Titan")).toBe(true);
    });
  });

  describe("Scenario: paginating with offset", () => {
    let baseline: Activity[];
    let paged: Activity[];

    beforeAll(async () => {
      const session = sessionWith(dataset);
      baseline = await session.callTool<Activity[]>("list_activities", { limit: 10 });
      paged = await session.callTool<Activity[]>("list_activities", { limit: 10, offset: 10 });
    });

    it("returns a full second page", () => {
      expect(paged).toHaveLength(10);
    });

    it("does not repeat rows from the first page", () => {
      const firstIds = new Set(baseline.map((r) => r.id));
      expect(paged.some((r) => firstIds.has(r.id))).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // SAD PATH
  // -------------------------------------------------------------------
  describe("Scenario: requesting a limit above the ceiling", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith(dataset).callTool("list_activities", { limit: 101 });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });

  describe("Scenario: passing a malformed from date", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith(dataset).callTool("list_activities", { from: "not-a-date" });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });
});
