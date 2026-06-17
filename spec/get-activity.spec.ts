// STORY-004 — Tool: get_activity
import { describe, it, expect, beforeAll } from "@jest/globals";
import { sessionWith, McpError } from "./support/harness";
import { row, type Row } from "./support/fixtures";

const dataset: Row[] = [
  row({ id: 42, team: "CAPS", target: "Titan", title: "Titan flyby T12" }),
];

describe("Feature: fetching a single activity by id", () => {
  // -------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------
  describe("Scenario: fetching an existing activity", () => {
    let result: Row;

    beforeAll(async () => {
      result = await sessionWith(dataset).callTool<Row>("get_activity", { id: 42 });
    });

    it("returns the requested row id", () => {
      expect(result.id).toBe(42);
    });

    it("returns the full title column", () => {
      expect(result.title).toBe("Titan flyby T12");
    });

    it("returns the description column", () => {
      expect(result.description).toBeDefined();
    });

    it("returns the derived ISO timestamp", () => {
      expect(result.start_iso).toBeDefined();
    });
  });

  // -------------------------------------------------------------------
  // SAD PATH
  // -------------------------------------------------------------------
  describe("Scenario: requesting an id that does not exist", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith(dataset).callTool("get_activity", { id: 999999 });
    });

    it("rejects with an MCP error naming the missing id", async () => {
      await expect(act()).rejects.toThrow(/999999/);
    });
  });

  describe("Scenario: passing a non-integer id", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith(dataset).callTool("get_activity", { id: "abc" });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });
});
