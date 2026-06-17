// Regression guard: every tool advertised by tools/list must expose a
// well-formed inputSchema so MCP clients can discover what args each tool
// accepts. The timeline bug (ZodEffects wrapping stripped properties) was
// silent at runtime but broke the contract — this spec would have caught it.
import { describe, it, expect, beforeAll } from "@jest/globals";
import { sessionWith, type ToolDescriptorRaw } from "./support/harness";
import { row } from "./support/fixtures";

const EXPECTED_TOOLS = [
  "list_activities",
  "get_activity",
  "search_activities",
  "count_activities",
  "aggregate_activities",
  "timeline",
  "list_distinct",
] as const;

describe("Feature: tools/list advertises complete input schemas", () => {
  describe("Scenario: an MCP client inspects available tools", () => {
    let tools: ToolDescriptorRaw[];

    beforeAll(async () => {
      tools = await sessionWith([row()]).listToolDescriptors();
    });

    // One it() per tool so failures name the offending tool clearly.
    for (const toolName of EXPECTED_TOOLS) {
      it(`${toolName} has inputSchema type "object" with non-empty properties`, () => {
        const tool = tools.find((t) => t.name === toolName);
        expect(tool).toBeDefined();
        expect(tool!.inputSchema.type).toBe("object");
        expect(tool!.inputSchema.properties).toBeDefined();
        expect(Object.keys(tool!.inputSchema.properties!).length).toBeGreaterThan(0);
      });
    }
  });
});
