// STORY-005 — Tool: search_activities
import { describe, it, expect, beforeAll } from "@jest/globals";
import { sessionWith, McpError } from "./support/harness";
import { row, type Row } from "./support/fixtures";

interface Hit {
  id: number;
  start_iso: string;
  team: string;
  target: string;
  title: string;
  snippet: string;
}

const dataset: Row[] = [
  row({ id: 1, title: "Enceladus plume observation", description: "south polar jets" }),
  row({ id: 2, title: "Titan radar swath", description: "surface mapping" }),
  row({ id: 3, title: "Enceladus flyby E5", description: "plume sampling pass" }),
];

describe("Feature: searching activities by full text", () => {
  // -------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------
  describe("Scenario: searching for a term that matches", () => {
    let result: Hit[];

    beforeAll(async () => {
      result = await sessionWith(dataset).callTool<Hit[]>("search_activities", { query: "Enceladus" });
    });

    it("returns only rows containing the term", () => {
      expect(result.every((h) => /enceladus/i.test(h.title) || /enceladus/i.test(h.snippet))).toBe(true);
    });

    it("returns every matching row", () => {
      expect(result).toHaveLength(2);
    });

    it("includes a non-empty snippet on each hit", () => {
      expect(result.every((h) => h.snippet.length > 0)).toBe(true);
    });
  });

  describe("Scenario: omitting the limit argument", () => {
    let result: Hit[];

    beforeAll(async () => {
      const many: Row[] = Array.from({ length: 15 }, (_, i) =>
        row({ id: i + 1, title: `Titan pass ${i}`, description: "Titan encounter" }),
      );
      result = await sessionWith(many).callTool<Hit[]>("search_activities", { query: "Titan" });
    });

    it("caps the result at the default of 10", () => {
      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  // -------------------------------------------------------------------
  // SAD PATH
  // -------------------------------------------------------------------
  describe("Scenario: searching with no matches", () => {
    let result: Hit[];

    beforeAll(async () => {
      result = await sessionWith(dataset).callTool<Hit[]>("search_activities", {
        query: "nonsense_xyz_no_match",
      });
    });

    it("returns an empty array rather than erroring", () => {
      expect(result).toEqual([]);
    });
  });

  describe("Scenario: querying with fewer than two characters", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith(dataset).callTool("search_activities", { query: "a" });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });

  describe("Scenario: requesting a limit above the ceiling", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith(dataset).callTool("search_activities", { query: "Titan", limit: 51 });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });
});
