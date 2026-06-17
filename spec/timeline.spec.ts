// STORY-008 — Tool: timeline
import { describe, it, expect, beforeAll } from "@jest/globals";
import { sessionWith, McpError } from "./support/harness";
import { row, type Row } from "./support/fixtures";

interface TimelineBucket {
  bucket: string;
  count: number;
}

describe("Feature: bucketing activities into a timeline", () => {
  // -------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------
  describe("Scenario: yearly buckets across a multi-year range", () => {
    let result: TimelineBucket[];

    beforeAll(async () => {
      const data: Row[] = [
        row({ id: 1, start_iso: "2004-06-01T00:00:00Z" }),
        row({ id: 2, start_iso: "2006-06-01T00:00:00Z" }),
        row({ id: 3, start_iso: "2017-06-01T00:00:00Z" }),
      ];
      result = await sessionWith(data).callTool<TimelineBucket[]>("timeline", {
        from: "2004-01-01T00:00:00Z",
        to: "2018-01-01T00:00:00Z",
        bucket: "year",
      });
    });

    it("returns one bucket per year in the range", () => {
      expect(result).toHaveLength(14); // 2004..2017 inclusive
    });

    it("orders buckets ascending", () => {
      const labels = result.map((b) => b.bucket);
      expect(labels).toEqual([...labels].sort());
    });

    it("includes a zero-count year for 2005", () => {
      expect(result.find((b) => b.bucket === "2005")?.count).toBe(0);
    });

    it("counts the activity in 2004", () => {
      expect(result.find((b) => b.bucket === "2004")?.count).toBe(1);
    });
  });

  describe("Scenario: monthly buckets across a short range", () => {
    let result: TimelineBucket[];

    beforeAll(async () => {
      const data: Row[] = [row({ id: 1, start_iso: "2010-02-15T00:00:00Z" })];
      result = await sessionWith(data).callTool<TimelineBucket[]>("timeline", {
        from: "2010-01-01T00:00:00Z",
        to: "2010-04-01T00:00:00Z",
        bucket: "month",
      });
    });

    it("returns one bucket per month in the range", () => {
      expect(result).toHaveLength(3);
    });
  });

  describe("Scenario: filtering the timeline by team", () => {
    let result: TimelineBucket[];

    beforeAll(async () => {
      const data: Row[] = [
        row({ id: 1, team: "CAPS", start_iso: "2010-06-01T00:00:00Z" }),
        row({ id: 2, team: "CDA", start_iso: "2010-06-02T00:00:00Z" }),
      ];
      result = await sessionWith(data).callTool<TimelineBucket[]>("timeline", {
        from: "2010-01-01T00:00:00Z",
        to: "2011-01-01T00:00:00Z",
        bucket: "year",
        team: "CAPS",
      });
    });

    it("counts only the filtered team", () => {
      expect(result.find((b) => b.bucket === "2010")?.count).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // SAD PATH
  // -------------------------------------------------------------------
  describe("Scenario: a to date before the from date", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () =>
        sessionWith([row()]).callTool("timeline", {
          from: "2010-01-01T00:00:00Z",
          to: "2009-01-01T00:00:00Z",
        });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });

  describe("Scenario: omitting the from argument", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      act = () => sessionWith([row()]).callTool("timeline", { to: "2010-01-01T00:00:00Z" });
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });
});
