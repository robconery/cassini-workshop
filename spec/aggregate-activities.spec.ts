// STORY-007 — Tool: aggregate_activities
import { describe, it, expect, beforeAll } from "@jest/globals";
import { sessionWith, McpError } from "./support/harness";
import { row, type Row } from "./support/fixtures";

interface Bucket {
  key: string;
  count: number;
}

const dataset: Row[] = [
  ...Array.from({ length: 5 }, (_, i) => row({ id: i + 1, target: "Titan", team: "CAPS" })),
  ...Array.from({ length: 3 }, (_, i) => row({ id: i + 10, target: "Saturn", team: "CDA" })),
  ...Array.from({ length: 2 }, (_, i) => row({ id: i + 20, target: "Enceladus", team: "CAPS" })),
];

describe("Feature: aggregating activities by a column", () => {
  // -------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------
  describe("Scenario: grouping by target", () => {
    let result: Bucket[];

    beforeAll(async () => {
      result = await sessionWith(dataset).callTool<Bucket[]>("aggregate_activities", { group_by: "target" });
    });

    it("returns one bucket per distinct target", () => {
      expect(result).toHaveLength(3);
    });

    it("orders buckets by descending count", () => {
      const counts = result.map((b) => b.count);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
    });

    it("puts the most frequent target first", () => {
      expect(result[0].key).toBe("Titan");
    });
  });

  describe("Scenario: omitting the top argument", () => {
    let result: Bucket[];

    beforeAll(async () => {
      const wide: Row[] = Array.from({ length: 40 }, (_, i) =>
        row({ id: i + 1, target: `Body-${i}` }),
      );
      result = await sessionWith(wide).callTool<Bucket[]>("aggregate_activities", { group_by: "target" });
    });

    it("caps the result at the default top of 20", () => {
      expect(result.length).toBeLessThanOrEqual(20);
    });
  });

  describe("Scenario: grouping by team within a target filter", () => {
    let result: Bucket[];

    beforeAll(async () => {
      result = await sessionWith(dataset).callTool<Bucket[]>("aggregate_activities", {
        group_by: "team",
        target: "Titan",
      });
    });

    it("reflects only the filtered rows", () => {
      const total = result.reduce((sum, b) => sum + b.count, 0);
      expect(total).toBe(5);
    });
  });

  // -------------------------------------------------------------------
  // SAD PATH
  // -------------------------------------------------------------------
  describe("Scenario: grouping by an unsupported column", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith(dataset).callTool("aggregate_activities", { group_by: "description" });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });

  describe("Scenario: requesting a top above the ceiling", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith(dataset).callTool("aggregate_activities", { group_by: "team", top: 101 });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });
});
