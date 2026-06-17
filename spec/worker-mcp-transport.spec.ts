// STORY-001 — Worker scaffold + MCP transport
import { describe, it, expect, beforeAll } from "@jest/globals";
import { sessionWith, McpError, type Session } from "./support/harness";
import { row } from "./support/fixtures";

const TOOL_NAMES = [
  "list_activities",
  "get_activity",
  "search_activities",
  "count_activities",
  "aggregate_activities",
  "timeline",
  "list_distinct",
];

describe("Feature: a client connects to the Cassini MCP server", () => {
  // -------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------
  describe("Scenario: completing the initialize handshake", () => {
    let init: { serverInfo: { name: string; version: string } };

    beforeAll(async () => {
      const session = sessionWith([row()]);
      init = await session.initialize();
    });

    it("reports the server name", () => {
      expect(init.serverInfo.name).toBe("cassini-mission-plan");
    });

    it("reports a semantic version", () => {
      expect(init.serverInfo.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe("Scenario: listing the available tools", () => {
    let tools: string[];

    beforeAll(async () => {
      const session = sessionWith([row()]);
      tools = await session.listTools();
    });

    it("exposes exactly seven tools", () => {
      expect(tools).toHaveLength(7);
    });

    it("exposes precisely the declared tool names", () => {
      expect(tools.sort()).toEqual([...TOOL_NAMES].sort());
    });
  });

  // -------------------------------------------------------------------
  // SAD PATH
  // -------------------------------------------------------------------
  describe("Scenario: calling a tool that does not exist", () => {
    let act: () => Promise<unknown>;

    beforeAll(() => {
      const session: Session = sessionWith([row()]);
      act = () => session.callTool("no_such_tool", {});
    });

    it("rejects with an MCP error", async () => {
      await expect(act()).rejects.toBeInstanceOf(McpError);
    });
  });
});
