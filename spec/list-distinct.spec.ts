// STORY-009 — Tool: list_distinct
import { describe, it, expect, beforeAll } from "@jest/globals";
import { sessionWith, McpError, type Session } from "./support/harness";
import { row, type Row } from "./support/fixtures";

const dataset: Row[] = [
  row({ id: 1, team: "CDA" }),
  row({ id: 2, team: "CAPS" }),
  row({ id: 3, team: "CAPS" }),
  row({ id: 4, team: "MAG" }),
];

describe("Feature: listing distinct values of a column", () => {
  // -------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------
  describe("Scenario: listing distinct teams", () => {
    let result: string[];

    beforeAll(async () => {
      result = await sessionWith(dataset).callTool<string[]>("list_distinct", { field: "team" });
    });

    it("deduplicates the values", () => {
      expect(result).toHaveLength(3);
    });

    it("returns the values in ascending order", () => {
      expect(result).toEqual([...result].sort());
    });

    it("contains the expected teams", () => {
      expect(result).toEqual(["CAPS", "CDA", "MAG"]);
    });
  });

  describe("Scenario: calling the same field twice in one isolate", () => {
    let first: string[];
    let second: string[];

    beforeAll(async () => {
      const session: Session = sessionWith(dataset);
      first = await session.callTool<string[]>("list_distinct", { field: "team" });
      second = await session.callTool<string[]>("list_distinct", { field: "team" });
    });

    it("returns the same values on the cached second call", () => {
      expect(second).toEqual(first);
    });
  });

  // -------------------------------------------------------------------
  // SAD PATH
  // -------------------------------------------------------------------
  describe("Scenario: requesting an unsupported field", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith(dataset).callTool("list_distinct", { field: "description" });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });
});
