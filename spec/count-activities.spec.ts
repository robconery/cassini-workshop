// STORY-006 — Tool: count_activities
import { describe, it, expect, beforeAll } from "@jest/globals";
import { sessionWith, McpError } from "./support/harness";
import { row, type Row } from "./support/fixtures";

interface CountResult {
  count: number;
}

const dataset: Row[] = [
  row({ id: 1, team: "CAPS", target: "Titan" }),
  row({ id: 2, team: "CAPS", target: "Saturn" }),
  row({ id: 3, team: "CDA", target: "Titan" }),
];

describe("Feature: counting activities", () => {
  // -------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------
  describe("Scenario: counting with no filters", () => {
    let result: CountResult;

    beforeAll(async () => {
      result = await sessionWith(dataset).callTool<CountResult>("count_activities", {});
    });

    it("returns the full table cardinality", () => {
      expect(result.count).toBe(3);
    });
  });

  describe("Scenario: counting with a filter", () => {
    let result: CountResult;

    beforeAll(async () => {
      result = await sessionWith(dataset).callTool<CountResult>("count_activities", { target: "Titan" });
    });

    it("counts only matching rows", () => {
      expect(result.count).toBe(2);
    });
  });

  describe("Scenario: a count agreeing with a list sweep", () => {
    let count: number;
    let listed: Row[];

    beforeAll(async () => {
      const session = sessionWith(dataset);
      count = (await session.callTool<CountResult>("count_activities", { team: "CAPS" })).count;
      listed = await session.callTool<Row[]>("list_activities", { team: "CAPS", limit: 100 });
    });

    it("matches the number of listed rows", () => {
      expect(count).toBe(listed.length);
    });
  });

  describe("Scenario: counting with filters that match nothing", () => {
    let result: CountResult;

    beforeAll(async () => {
      result = await sessionWith(dataset).callTool<CountResult>("count_activities", { team: "NOBODY" });
    });

    it("returns zero rather than erroring", () => {
      expect(result.count).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // SAD PATH
  // -------------------------------------------------------------------
  describe("Scenario: passing an invalid date", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith(dataset).callTool("count_activities", { from: "garbage" });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });
});
